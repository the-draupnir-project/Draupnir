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
  ConfigPropertyDescription,
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
  renderConfigDocumentation(description: ConfigDescription): DocumentNode;
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
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        return (
          <fragment>
            <code>[]</code> (empty array)
          </fragment>
        );
      }
      return <ul>{value.map((value) => renderConfigPropertyValue(value))}</ul>;
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
  configProperty: ConfigPropertyDescription,
  data: Record<string, unknown>,
  errors: ConfigPropertyError[]
): DocumentNode {
  const propertyValue = data[configProperty.name];
  const error = findError(configProperty.name, errors);
  if (Array.isArray(propertyValue)) {
    return (
      <li>
        <details>
          <summary>
            {renderConfigPropertyError(error)}{" "}
            <code>{configProperty.name}</code>:
          </summary>
          {configProperty.description ?? "No description provided."}
          <ul>
            {propertyValue.map((value, index) =>
              renderConfigPropertyItem(
                configProperty.name,
                index,
                value,
                errors
              )
            )}
          </ul>
        </details>
      </li>
    );
  }
  return (
    <li>
      {renderConfigPropertyError(error)} <code>{configProperty.name}</code>:{" "}
      {renderConfigPropertyValue(propertyValue)}, default value:{" "}
      {renderConfigPropertyValue(configProperty.default)}.
      {configProperty.description ?? "No description provided."}
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
      {renderConfigPropertyError(error)}{" "}
      <code>{description.schema.title ?? "Untitled Config"}</code> {children}
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

function renderConfigDocumentation(
  description: ConfigDescription
): DocumentNode {
  return (
    <fragment>
      <p>{description.schema.description ?? "No description"}</p>
      <ul>
        {description.properties().map((property) => (
          <li>
            <code>{property.name}</code>:{" "}
            {property.description ?? "No description"}
            <p>default value: {renderConfigPropertyValue(property.default)}</p>
          </li>
        ))}
      </ul>
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
      <ul>
        {config.description
          .properties()
          .map((property) =>
            renderConfigProperty(
              property,
              config.data as Record<string, unknown>,
              config.error?.errors ?? []
            )
          )}
      </ul>
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
  renderConfigDocumentation,
}) satisfies PersistentConfigRenderer;
