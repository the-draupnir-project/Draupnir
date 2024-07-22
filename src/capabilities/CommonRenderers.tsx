// Copyright 2022-2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionError,
  ActionException,
  ActionResult,
  DescriptionMeta,
  MatrixRoomReference,
  ResultForUsersInRoom,
  RoomSetResult,
  StringRoomID,
  StringUserID,
  isOk,
} from "matrix-protection-suite";
import { DocumentNode } from "../commands/interface-manager/DeadDocument";
import { DeadDocumentJSX } from "../commands/interface-manager/JSXFactory";
import {
  renderMentionPill,
  renderRoomPill,
} from "../commands/interface-manager/MatrixHelpRenderer";

export function renderElaborationTrail(error: ActionError): DocumentNode {
  return (
    <details>
      <summary>Elaboration trail</summary>
      <ul>
        {error.getElaborations().map((elaboration) => (
          <li>
            <pre>{elaboration}</pre>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function renderDetailsNotice(error: ActionError): DocumentNode {
  if (!(error instanceof ActionException)) {
    return <fragment></fragment>;
  }
  return (
    <p>
      Details can be found by providing the reference <code>{error.uuid}</code>
      to an administrator.
    </p>
  );
}

export function renderExceptionTrail(error: ActionError): DocumentNode {
  if (!(error instanceof ActionException)) {
    return <fragment></fragment>;
  }
  if (!(error.exception instanceof Error)) {
    return <fragment></fragment>;
  }
  return (
    <details>
      <summary>
        Stack Trace for: <code>{error.exception.name}</code>
      </summary>
      <pre>{error.exception.toString()}</pre>
    </details>
  );
}

export function renderFailedSingularConsequence(
  description: DescriptionMeta,
  title: DocumentNode,
  error: ActionError
): DocumentNode {
  return (
    <fragment>
      <details>
        <summary>
          <code>{description.name}</code>: {title} - {renderOutcome(false)}
        </summary>
        {error.mostRelevantElaboration}
        {renderDetailsNotice(error)}
        {renderElaborationTrail(error)}
        {renderExceptionTrail(error)}
      </details>
    </fragment>
  );
}

export function renderOutcome(isOutcomeOk: boolean): DocumentNode {
  const colour = isOutcomeOk ? "#7cfc00" : "#E01F2B";
  return (
    <fragment>
      <span data-mx-color={colour}>{isOutcomeOk ? "OK" : "Failed"}</span>
    </fragment>
  );
}

function renderRoomOutcomeOk(roomID: StringRoomID): DocumentNode {
  return (
    <span>
      {renderRoomPill(MatrixRoomReference.fromRoomID(roomID))} -{" "}
      {renderOutcome(true)}
    </span>
  );
}

function renderUserOutcomeOk(
  userID: StringUserID,
  _result: ActionResult<unknown>
): DocumentNode {
  return (
    <span>
      {renderMentionPill(userID, userID)} - {renderOutcome(true)}
    </span>
  );
}

function renderOutcomeError(
  summary: DocumentNode,
  error: ActionError
): DocumentNode {
  return (
    <fragment>
      <details>
        <summary>{summary}</summary>
        {renderDetailsNotice(error)}
        {renderElaborationTrail(error)}
        {renderExceptionTrail(error)}
      </details>
    </fragment>
  );
}

function renderRoomOutcomeError(
  roomID: StringRoomID,
  error: ActionError
): DocumentNode {
  return renderOutcomeError(
    <fragment>
      {renderRoomPill(MatrixRoomReference.fromRoomID(roomID))} -{" "}
      {renderOutcome(false)}: {error.mostRelevantElaboration}
    </fragment>,
    error
  );
}

function renderUserOutcomeError(
  userID: StringUserID,
  error: ActionError
): DocumentNode {
  return renderOutcomeError(
    <fragment>
      {renderMentionPill(userID, userID)} - {renderOutcome(false)}
    </fragment>,
    error
  );
}

export function renderRoomOutcome(
  roomID: StringRoomID,
  result: ActionResult<unknown>
): DocumentNode {
  if (isOk(result)) {
    return renderRoomOutcomeOk(roomID);
  } else {
    return renderRoomOutcomeError(roomID, result.error);
  }
}

export function renderUserOutcome(
  userID: StringUserID,
  result: ActionResult<unknown>
): DocumentNode {
  if (isOk(result)) {
    return renderUserOutcomeOk(userID, result);
  } else {
    return renderUserOutcomeError(userID, result.error);
  }
}

export function renderRoomSetResult(
  roomResults: RoomSetResult,
  { summary }: { summary: DocumentNode }
): DocumentNode {
  return (
    <details>
      <summary>{summary}</summary>
      <ul>
        {[...roomResults.map.entries()].map(([roomID, outcome]) => {
          return <li>{renderRoomOutcome(roomID, outcome)}</li>;
        })}
      </ul>
    </details>
  );
}

export function renderResultForUsersInRoom(
  results: ResultForUsersInRoom,
  { summary }: { summary: DocumentNode }
): DocumentNode {
  return (
    <details>
      <summary>{summary}</summary>
      <ul>
        {[...results.map.entries()].map(([userID, outcome]) => (
          <li>{renderUserOutcome(userID, outcome)}</li>
        ))}
      </ul>
    </details>
  );
}
