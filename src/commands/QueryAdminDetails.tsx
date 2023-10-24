import { Permalinks, UserID, getRequestFn } from "matrix-bot-sdk";
import { MjolnirContext } from "./CommandHandler";
import { CommandError, CommandResult } from "./interface-manager/Validation";
import { defineInterfaceCommand, findTableCommand } from "./interface-manager/InterfaceCommand";
import { findPresentationType, makePresentationType, parameters, ParsedKeywords, simpleTypeValidator, union } from "./interface-manager/ParameterParsing";
import "./interface-manager/MatrixPresentations";
import { JSXFactory } from "./interface-manager/JSXFactory";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import { DocumentNode } from "./interface-manager/DeadDocument";
import { ReadItem } from "./interface-manager/CommandReader";

export type MatrixHomeserver = string;

makePresentationType({
    name: "MatrixHomeserver",
    // This is a very very crude way to detect a url.
    validator: simpleTypeValidator("MatrixHomeserver", (readItem: ReadItem) => (readItem instanceof String) && (!readItem.includes('#') || !readItem.includes('!')))
})

interface SupportJson {
    contacts?: {
        matrix_id?: string,
        email_address?: string;
        role: "admin" | "security";
    }[],
    support_page?: string;
}

async function queryAdminDetails(
    this: MjolnirContext,
    _keywords: ParsedKeywords,
    entity: UserID | MatrixHomeserver | string
): Promise<CommandResult<[UserID | MatrixHomeserver | string, SupportJson], CommandError>> {
    let domain: string;
    if (entity instanceof UserID) {
        domain = `https://${entity.domain}`;
    } else {
        // Doing some cleanup on the url
        if (!entity.startsWith("https://") && !entity.startsWith("http://")) {
            domain = `https://${entity}`;
        } else if (entity.startsWith("http://")) {
            domain = entity.replace("http://", "https://");
        } else {
            domain = entity;
        }
    }


    const resp: SupportJson = await new Promise((resolve, reject) => {
        getRequestFn()(`${domain}/.well-known/matrix/support`, (error: any, response: any, resBody: unknown) => {
            if (error || response.statusCode !== 200) {
                reject(error);
            } else if (typeof resBody === 'object' && resBody !== null && ('contacts' in resBody || 'support_page' in resBody)) {
                resolve(resBody as SupportJson)
            } else {
                reject(new TypeError(`Don't know what to do with response body ${JSON.stringify(resBody)}. Assuming its not a json`));
            }
        });
    });

    return CommandResult.Ok([entity, resp]);
}

defineInterfaceCommand({
    designator: ["queryAdmin"],
    table: "mjolnir",
    parameters: parameters([
        {
            name: "entity",
            acceptor: union(
                findPresentationType("UserID"),
                findPresentationType("MatrixHomeserver"),
                findPresentationType("string")
            )
        }
    ]),
    command: queryAdminDetails,
    summary: "Queries the admin of the Homeserver or user using MSC1929 if available",
})

function renderSupportJson([entity, support_json]: [UserID | MatrixHomeserver | string, SupportJson],): DocumentNode {
    if (!support_json.support_page) {
        return <root>
            <b>Support infos for ({entity}):</b>
            <ul>
                {support_json.contacts!.map(r => <li><b>{r.role}</b> - {r.matrix_id ? <a href={Permalinks.forUser(r.matrix_id)}>{r.matrix_id}</a> : <a href="mailto:{r.email_address}">{r.email_address}</a>}</li>)}
            </ul>
        </root>
    } else if (!support_json.contacts) {
        return <root>
            <b>Support Page for ({entity}):</b>
            <p>
                Support Page: {support_json.support_page}
            </p>
        </root>
    } else {
        return <root>
            <b>Support info for ({entity}):</b>
            <p>
                Support Page: {support_json.support_page}
            </p>
            <ul>
                {support_json.contacts!.map(r => <li><b>{r.role}</b> - {r.matrix_id ? <a href={Permalinks.forUser(r.matrix_id)}>{r.matrix_id}</a> : <a href="mailto:{r.email_address}">{r.email_address}</a>}</li>)}
            </ul>
        </root>
    }
}

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "queryAdmin"),
    renderer: async function (client, commandRoomId, event, result) {
        await renderMatrixAndSend(
            renderSupportJson(result.ok),
            commandRoomId, event, client
        );
    }
})
