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

const MatrixHomeserverSecret = Symbol("MatrixHomeserverSecret");
export type MatrixHomeserver = string & { [MatrixHomeserverSecret]: true };

function isMatrixHomeserver(string: string): string is MatrixHomeserver {
    return !string.includes('#') && !string.includes('!')
}

makePresentationType({
    name: "MatrixHomeserver",
    // This is a very very crude way to detect a url.
    validator: simpleTypeValidator("MatrixHomeserver", (readItem: ReadItem) => (typeof readItem === 'string') && isMatrixHomeserver(readItem))
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
        } else {
            domain = entity;
        }
    }


    try {
        const resp: SupportJson = await new Promise((resolve, reject) => {
            getRequestFn()(`${domain}/.well-known/matrix/support`, (error: any, response: any, resBody: unknown) => {
                if (error) {
                    reject(new CommandError(`The request failed with an error: ${error}.`));
                } else if (response.statusCode !== 200) {
                    reject(new CommandError(`The server didn't reply with a valid response code: ${response.statusCode}.`));
                } else if (typeof resBody === 'object' && resBody !== null && ('contacts' in resBody || 'support_page' in resBody)) {
                    resolve(resBody as SupportJson)
                } else if (resBody === null) {
                    reject(new CommandError(`The response was empty.`));
                } else {
                    reject(new CommandError(`Don't know what to do with response body ${resBody}. Assuming its not a json`));
                }
            });
        });
        return CommandResult.Ok([entity, resp]);
    } catch (error: any) {
        return CommandResult.Err(error);
    }
}

defineInterfaceCommand({
    designator: ["query", "admin"],
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
            <b>Support info for ({entity}):</b><br />
            <ul>
                {support_json.contacts!.map(r => <li><b>{r.role}</b> - {r.matrix_id ? <a href={Permalinks.forUser(r.matrix_id)}>{r.matrix_id}</a> : <a href="mailto:{r.email_address}">{r.email_address}</a>}<br /></li>)}
            </ul>
        </root>
    } else if (!support_json.contacts) {
        return <root>
            <b>Support Page for ({entity}):</b><br />
            <p>
                Support Page: {support_json.support_page}
            </p>
        </root>
    } else {
        return <root>
            <b>Support info for ({entity}):</b><br />
            <p>
                Support Page: {support_json.support_page}
            </p><br />
            <ul>
                {support_json.contacts!.map(r => <li><b>{r.role}</b> - {r.matrix_id ? <a href={Permalinks.forUser(r.matrix_id)}>{r.matrix_id}</a> : <a href="mailto:{r.email_address}">{r.email_address}</a>}<br /></li>)}
            </ul>
        </root>
    }
}

defineMatrixInterfaceAdaptor({
    interfaceCommand: findTableCommand("mjolnir", "query", "admin"),
    renderer: async function (client, commandRoomId, event, result) {
        await renderMatrixAndSend(
            renderSupportJson(result.ok),
            commandRoomId, event, client
        );
    }
})
