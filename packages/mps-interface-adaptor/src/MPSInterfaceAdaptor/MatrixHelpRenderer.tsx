// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import {
  ActionError,
  ActionException,
  ActionResult,
  Logger,
  Ok,
  RoomEvent,
  RoomMessageSender,
  Task,
  isError,
  isOk,
} from "matrix-protection-suite";
import { MatrixRoomReference } from "@the-draupnir-project/matrix-basic-types";
import {
  ArgumentParseError,
  CommandDescription,
  BaseCommandTableEntry,
  DeadDocumentJSX,
  DocumentNode,
  ParameterDescription,
  RestDescription,
  TextPresentationRenderer,
  CommandTable,
  Command,
  CommandTableEntry,
  LeafNode,
  UnexpectedArgumentError,
} from "@the-draupnir-project/interface-manager";
import {
  MatrixAdaptorContext,
  MatrixEventContext,
  sendMatrixEventsFromDeadDocument,
} from "./MPSMatrixInterfaceAdaptor";
import { Result } from "@gnuxie/typescript-result";
import { printPresentationSchema } from "@the-draupnir-project/interface-manager/dist/Command/PresentationSchema";
import { RoomReactionSender } from "matrix-protection-suite/dist/Client/RoomReactionSender";
import { replyNoticeText } from "./replyNotice";
import {
  renderDetailsNotice,
  renderElaborationTrail,
  renderExceptionTrail,
} from "./CommonRenderers";

const log = new Logger("MatrixHelpRenderer");

function requiredArgument(argumentName: string): string {
  return `<${argumentName}>`;
}

function keywordArgument(keyword: string): string {
  // ahh fuck what about defaults for keys?
  return `[--${keyword}]`;
}

// they should be allowed to name the rest argument...
function restArgument(rest: RestDescription): string {
  return `[...${rest.name}]`;
}

export function renderParameterDescription(
  description: ParameterDescription
): DocumentNode {
  return (
    <fragment>
      {description.name} - {description.description ?? "no description"}
      <br />
    </fragment>
  );
}

export function renderCommandSummary(
  command: CommandDescription,
  tableEntry: BaseCommandTableEntry
): DocumentNode {
  return (
    <details>
      <summary>
        <code>{renderCommandHelp(command, tableEntry.designator)}</code> -{" "}
        {command.summary}
      </summary>
      {command.description ? (
        <fragment>
          <b>Description:</b>
          <br />
          {command.description}
          <br />
        </fragment>
      ) : (
        <fragment></fragment>
      )}
      {command.parametersDescription.descriptions.length > 0 ? (
        <fragment>
          <b>Parameters:</b>
          <br />
          {...command.parametersDescription.descriptions.map(
            renderParameterDescription
          )}
        </fragment>
      ) : (
        <fragment></fragment>
      )}
    </details>
  );
}

export function renderCommandHelp(
  command: CommandDescription,
  designator: string[]
): string {
  const rest = command.parametersDescription.rest;
  const keywords = command.parametersDescription.keywords;
  return [
    ...designator,
    ...command.parametersDescription.descriptions.map((d) =>
      requiredArgument(d.name)
    ),
    ...(rest ? [restArgument(rest)] : []),
    ...Object.keys(keywords.keywordDescriptions).map((k) => keywordArgument(k)),
  ].join(" ");
}

export function renderErrorDetails(error: ActionError): DocumentNode {
  return (
    <details>
      <summary>{error.mostRelevantElaboration}</summary>
      {renderDetailsNotice(error)}
      {renderElaborationTrail(error)}
      {renderExceptionTrail(error)}
    </details>
  );
}

export async function replyToEventWithErrorDetails(
  roomMessageSender: RoomMessageSender,
  event: RoomEvent,
  error: ActionError
): Promise<Result<void>> {
  return (await sendMatrixEventsFromDeadDocument(
    roomMessageSender,
    event.room_id,
    <root>{renderErrorDetails(error)}</root>,
    { replyToEvent: event }
  )) as Result<void>;
}

export function renderActionResultToEvent(
  roomMessageSender: RoomMessageSender,
  roomReactionSender: RoomReactionSender,
  event: RoomEvent,
  result: ActionResult<void>
): void {
  if (isError(result)) {
    void Task(
      replyToEventWithErrorDetails(roomMessageSender, event, result.error)
    );
  }
  void Task(reactToEventWithResult(roomReactionSender, event, result));
}

// Maybe we need something like the MatrixInterfaceAdaptor but for Error types?

function formattedArgumentHint(error: ArgumentParseError): string {
  const argumentsUpToError = error.partialCommand.stream.source.slice(
    0,
    error.partialCommand.stream.getPosition()
  );
  let commandContext = "Command context:";
  for (const argument of argumentsUpToError) {
    commandContext += ` ${TextPresentationRenderer.render(argument)}`;
  }
  const badArgument = error.partialCommand.stream.peekItem();
  const badArgumentHint = ` ${
    badArgument === undefined
      ? "undefined"
      : TextPresentationRenderer.render(badArgument)
  }\n${Array(commandContext.length + 1).join(
    " "
  )} ^ expected ${printPresentationSchema(error.parameter.acceptor)} here`;
  return commandContext + badArgumentHint;
}

export async function reactToEventWithResult(
  roomReactionSender: RoomReactionSender,
  event: RoomEvent,
  result: ActionResult<unknown>
): Promise<ActionResult<void>> {
  // implement this so we can use it in the invitation protection
  // then in the invitation protection makes ure we render when the listener fails
  // then in the ban propagation protection also do this.
  const react = async (emote: string): Promise<ActionResult<void>> => {
    return (await roomReactionSender.sendReaction(
      event.room_id,
      event.event_id,
      emote
    )) as Result<void>;
  };
  if (isOk(result)) {
    return await react("✅");
  } else {
    return await react("❌");
  }
}

function renderArgumentParseError(error: ArgumentParseError): DocumentNode {
  return (
    <root>
      There was a problem when parsing the <code>{error.parameter.name}</code>{" "}
      parameter for this command.
      <br />
      {renderCommandHelp(
        error.partialCommand.description,
        error.partialCommand.designator
      )}
      <br />
      {error.message}
      <br />
      <pre>{formattedArgumentHint(error)}</pre>
    </root>
  );
}

function renderUnexpectedArgumentError(
  error: UnexpectedArgumentError
): DocumentNode {
  return (
    <root>
      There was an unexpected argument provided for this command.
      <br />
      {renderCommandHelp(
        error.partialCommand.description,
        error.partialCommand.designator
      )}
      <br />
      {error.message}
      <br />
    </root>
  );
}

export async function matrixCommandRenderer<
  TAdaptorContext extends MatrixAdaptorContext,
  TEventContext extends MatrixEventContext,
>(
  { clientPlatform, commandRoomID }: TAdaptorContext,
  { event }: TEventContext,
  _command: Command,
  result: Result<unknown>
): Promise<Result<void>> {
  void Task(
    reactToEventWithResult(clientPlatform.toRoomReactionSender(), event, result)
  );
  if (isError(result)) {
    if (result.error instanceof ArgumentParseError) {
      return (await sendMatrixEventsFromDeadDocument(
        clientPlatform.toRoomMessageSender(),
        commandRoomID,
        renderArgumentParseError(result.error),
        { replyToEvent: event }
      )) as Result<void>;
    } else if (result.error instanceof UnexpectedArgumentError) {
      return (await sendMatrixEventsFromDeadDocument(
        clientPlatform.toRoomMessageSender(),
        commandRoomID,
        renderUnexpectedArgumentError(result.error),
        { replyToEvent: event }
      )) as Result<void>;
    } else if (result.error instanceof ActionException) {
      const commandError = result.error;
      log.error(
        "command error",
        commandError.uuid,
        commandError.message,
        commandError.exception
      );
      return (await sendMatrixEventsFromDeadDocument(
        clientPlatform.toRoomMessageSender(),
        commandRoomID,
        renderCommandException(result.error),
        { replyToEvent: event }
      )) as Result<void>;
    } else {
      const noticeResult = await replyNoticeText(
        clientPlatform.toRoomMessageSender(),
        commandRoomID,
        event.event_id,
        `An unexpected error occurred while processing the command: ${result.error.message}`
      );
      if (isError(noticeResult)) {
        return noticeResult.elaborate(
          "Could not reply to a command to report an error back to the user"
        );
      }
      return Ok(undefined);
    }
  }
  return Ok(undefined);
}

function renderCommandException(error: ActionException): DocumentNode {
  return (
    <root>
      There was an unexpected error when processing this command:
      <br />
      {error.message}
      <br />
      Details can be found by providing the reference <code>{error.uuid}</code>
      to an administrator.
    </root>
  );
}

export function renderMentionPill(
  mxid: string,
  displayName: string
): DocumentNode {
  const url = `https://matrix.to/#/${mxid}`;
  return <a href={url}>{displayName}</a>;
}

export function renderRoomPill(room: MatrixRoomReference): DocumentNode {
  return <a href={room.toPermalink()}>{room.toRoomIDOrAlias()}</a>;
}

function sortCommandsBySourceTable(
  table: CommandTable
): Map<CommandTable, CommandTableEntry[]> {
  const commandsBySourceTable = new Map<CommandTable, CommandTableEntry[]>();
  for (const command of table.getAllCommands()) {
    const sourceTable = command.sourceTable;
    const groupedCommands =
      commandsBySourceTable.get(sourceTable) ??
      ((groupedCommands) => (
        commandsBySourceTable.set(sourceTable, groupedCommands),
        groupedCommands
      ))([]);
    groupedCommands.push(command);
  }
  return commandsBySourceTable;
}

function sortGroupedCommandsByDesignator(
  commandsBySourceTable: Map<CommandTable, CommandTableEntry[]>
): Map<CommandTable, CommandTableEntry[]> {
  for (const commands of commandsBySourceTable.values()) {
    commands.sort((a, b) => {
      const aDesignator = a.designator.join(".");
      const bDesignator = b.designator.join(".");
      return aDesignator.localeCompare(bDesignator);
    });
  }
  return commandsBySourceTable;
}

function renderSourceTableSummary(
  sourceTable: CommandTable,
  sortedEntries: CommandTableEntry[]
): DocumentNode {
  const tableName =
    typeof sourceTable.name === "string"
      ? sourceTable.name.charAt(0).toUpperCase() + sourceTable.name.slice(1)
      : sourceTable.name.toString();
  return (
    <fragment>
      <details>
        <summary>
          <b>{tableName} commands:</b>
        </summary>
        {sortedEntries.map((entry) =>
          renderCommandSummary(entry.currentCommand, entry)
        )}
      </details>
    </fragment>
  );
}

export function renderTableHelp(
  table: CommandTable,
  documentationURL: string
): DocumentNode {
  const groupedAndSortedCommands = sortGroupedCommandsByDesignator(
    sortCommandsBySourceTable(table)
  );
  return (
    <fragment>
      <b>Documentation: </b> <a href={documentationURL}>{documentationURL}</a>
      <br />
      {[...groupedAndSortedCommands.entries()].map(
        ([sourceTable, sortedEntries]) =>
          renderSourceTableSummary(sourceTable, sortedEntries)
      )}
    </fragment>
  );
}

export function wrapInRoot(
  node: DocumentNode | LeafNode | (DocumentNode | LeafNode)[]
): DocumentNode {
  return <root>{node}</root>;
}
