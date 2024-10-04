// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import {
  MatrixRoomAlias,
  MatrixRoomID,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ConfigDescription,
  ConfigParseError,
  ConfigPropertyError,
  ConfigPropertyUseError,
} from "matrix-protection-suite";
import {
  renderMentionPill,
  renderRoomPill,
} from "../commands/interface-manager/MatrixHelpRenderer";
import { PersistentConfigStatus } from "./PersistentConfigEditor";

const ConfigStatusIndicator = Object.freeze({
  Ok: "✔",
  UseError: "⚠",
  ParseError: "❌",
});

export interface PersistentConfigRenderer {
  renderConfigStatus(config: PersistentConfigStatus): DocumentNode;
  renderAdaptorStatus(info: PersistentConfigStatus[]): DocumentNode;
}

function findError(
  propertyKey: string,
  errors: ConfigPropertyError[]
): ConfigPropertyError | undefined {
  const path = `/${propertyKey}`;
  return errors.find((error) => error.path.startsWith(path));
}

function findItemError(
  propertyKey: string,
  index: number,
  errors: ConfigPropertyError[]
): ConfigPropertyError | undefined {
  const path = `/${propertyKey}/${index}`;
  return errors.find((error) => error.path === path);
}

function renderPrimitiveValue(value: string, type: string): DocumentNode {
  return (
    <fragment>
      <code>{value}</code> <span>({type})</span>
    </fragment>
  );
}

function renderConfigPropertyValue(value: unknown): DocumentNode {
  if (typeof value === "object" && value !== null) {
    if (value instanceof MatrixRoomAlias || value instanceof MatrixRoomID) {
      return renderRoomPill(value);
    } else if (value instanceof MatrixUserID) {
      return renderMentionPill(value.toString(), value.toString());
    } else {
      return (
        <fragment>
          <code>{String(value)}</code>{" "}
          <span data-mx-color="#D2691E">(object)</span>
        </fragment>
      );
    }
  } else if (typeof value === "string") {
    return renderPrimitiveValue(value, "string");
  } else if (typeof value === "number") {
    return renderPrimitiveValue(String(value), "number");
  } else {
    return renderPrimitiveValue(String(value), "unknown");
  }
}

function renderConfigPropertyItem(
  propertyKey: string,
  index: number,
  value: unknown,
  errors: ConfigPropertyError[]
): DocumentNode {
  const error = findItemError(propertyKey, index, errors);
  return (
    <li>
      {renderConfigPropertyError(error)} <code>{index}</code>:{" "}
      {renderConfigPropertyValue(value)}
    </li>
  );
}

function renderConfigPropertyError(
  error: ConfigPropertyError | ConfigParseError | undefined
): string {
  if (error === undefined) {
    return ConfigStatusIndicator.Ok;
  } else if (error instanceof ConfigPropertyUseError) {
    return ConfigStatusIndicator.UseError;
  } else if (error instanceof ConfigParseError) {
    if (error.errors.every((e) => e instanceof ConfigPropertyUseError)) {
      return ConfigStatusIndicator.UseError;
    } else {
      return ConfigStatusIndicator.ParseError;
    }
  } else {
    return ConfigStatusIndicator.ParseError;
  }
}

function renderConfigProperty(
  propertyKey: string,
  data: Record<string, unknown>,
  errors: ConfigPropertyError[]
): DocumentNode {
  const propertyValue = data[propertyKey];
  const error = findError(propertyKey, errors);
  if (Array.isArray(propertyValue)) {
    return (
      <li>
        <details>
          <summary>
            {renderConfigPropertyError(error)} <code>{propertyKey}</code>:
          </summary>
          <ul>
            {propertyValue.map((value, index) =>
              renderConfigPropertyItem(propertyKey, index, value, errors)
            )}
          </ul>
        </details>
      </li>
    );
  }
  return (
    <li>
      {renderConfigPropertyError(error)}
      <code>{propertyKey}</code>: {renderConfigPropertyValue(propertyValue)}
    </li>
  );
}

function renderConfigDetails(
  error: ConfigParseError | undefined,
  description: ConfigDescription,
  children: DocumentNode
): DocumentNode {
  return (
    <fragment>
      <summary>
        {renderConfigPropertyError(error)}{" "}
        <code>{description.schema.title ?? "Untitled Config"}</code>
      </summary>{" "}
      {children}
    </fragment>
  );
}

function renderBodgedConfig(config: PersistentConfigStatus): DocumentNode {
  if (config.data === undefined) {
    return renderConfigDetails(
      undefined,
      config.description,
      <fragment>No data is currently persisted for this config.</fragment>
    );
  }
  return renderConfigDetails(
    config.error,
    config.description,
    <fragment>
      The config seems to be entirely invalid:{" "}
      {renderConfigPropertyValue(config.data)}
    </fragment>
  );
}

export const StandardPersistentConfigRenderer = Object.freeze({
  renderConfigStatus(config: PersistentConfigStatus): DocumentNode {
    if (typeof config.data !== "object" || config.data === null) {
      return renderBodgedConfig(config);
    }
    return renderConfigDetails(
      config.error,
      config.description,
      <fragment>
        {config.description
          .properties()
          .map((property) =>
            renderConfigProperty(
              property.name,
              config.data as Record<string, unknown>,
              config.error?.errors ?? []
            )
          )}
      </fragment>
    );
  },
  renderAdaptorStatus(info: PersistentConfigStatus[]): DocumentNode {
    return (
      <fragment>
        Persistent configuration status:
        <ul>
          {info.map((config) => (
            <li>{this.renderConfigStatus(config)}</li>
          ))}
        </ul>
      </fragment>
    );
  },
}) satisfies PersistentConfigRenderer;
