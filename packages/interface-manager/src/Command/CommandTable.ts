// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { StringPresentationType } from "../TextReader";
import { CommandDescription } from "./CommandDescription";
import {
  Presentation,
  PresentationType,
  PresentationTypeWithoutWrap,
} from "./Presentation";
import {
  PresentationArgumentStream,
  StandardPresentationArgumentStream,
} from "./PresentationStream";
import { PresentationTypeTranslator } from "./PresentationTypeTranslator";

export type BaseCommandTableEntry =
  | EmptyCommandTableEntry
  | CommandTableEntry
  | SubCommandTableEntry;

export type EmptyCommandTableEntry = {
  designator: string[];
  sourceTable: CommandTable;
  subCommands?: never;
  currentCommand?: never;
};

export type CommandTableEntry = {
  subCommands?: Map<string, BaseCommandTableEntry>;
  currentCommand: CommandDescription;
  designator: string[];
  sourceTable: CommandTable;
};

export type SubCommandTableEntry = {
  subCommands: Map<string, BaseCommandTableEntry>;
  currentCommand?: CommandDescription;
  designator: string[];
  sourceTable: CommandTable;
};

export type CommandTableImport = {
  table: CommandTable;
  baseDesignator: string[];
};

export interface CommandTable {
  readonly name: string | symbol;
  /**
   * Can be used to render a help command with an index of all the commands.
   * @returns All of the commands in this table.
   */
  getAllCommands(): CommandTableEntry[];

  /**
   * @returns Only the commands interned in this table, excludes imported commands.
   */
  getExportedCommands(): CommandTableEntry[];
  getImportedTables(): CommandTableImport[];
  findAMatchingCommand(
    stream: PresentationArgumentStream
  ): CommandDescription | undefined;
  internCommand(
    command: CommandDescription,
    designator: string[]
  ): CommandTable;
  /**
   * Import the commands from a different table into this one.
   * @param baseDesignator A designator to use as a base for all of the table's
   * commands before importing them. So for example, commands for the join wave
   * short-circuit protection might add a base designator of ["join" "wave"].
   * So the complete designator for a status command that the join wave short-circuit
   * protection defined would be  ["join", "wave", "status"] in this table.
   */
  importTable(table: CommandTable, baseDesignator: string[]): void;
  isContainingCommand(command: CommandDescription): boolean;
  internPresentationTypeTranslator(
    translator: PresentationTypeTranslator
  ): CommandTable;
  findPresentationTypeTranslator(
    toType: PresentationTypeWithoutWrap,
    fromType: PresentationTypeWithoutWrap
  ): PresentationTypeTranslator | undefined;
}

export class StandardCommandTable implements CommandTable {
  private readonly exportedCommands = new Set<CommandTableEntry>();
  private readonly flattenedCommands = new Map<
    CommandDescription,
    CommandTableEntry
  >();
  private readonly commands: BaseCommandTableEntry = {
    designator: [],
    sourceTable: this,
  };
  private readonly translators = new Map<string, PresentationTypeTranslator>();
  /** Imported tables are tables that "add commands" to this table. They are not sub commands. */
  private readonly importedTables = new Map<CommandTable, CommandTableImport>();

  constructor(public readonly name: string | symbol) {}

  /**
   * Can be used to render a help command with an index of all the commands.
   * @returns All of the commands in this table.
   */
  public getAllCommands(): CommandTableEntry[] {
    return [...this.flattenedCommands.values()];
  }

  /**
   * @returns Only the commands interned in this table, excludes imported commands.
   */
  public getExportedCommands(): CommandTableEntry[] {
    return [...this.exportedCommands.values()];
  }

  public getImportedTables(): CommandTableImport[] {
    return [...this.importedTables.values()];
  }

  private findAMatchingCommandEntry(
    stream: PresentationArgumentStream
  ): BaseCommandTableEntry | undefined {
    const tableHelper = (
      startingTableEntry: BaseCommandTableEntry,
      argumentStream: PresentationArgumentStream
    ): undefined | BaseCommandTableEntry => {
      const nextArgument = argumentStream.peekItem();
      if (
        nextArgument === undefined ||
        typeof nextArgument.object !== "string"
      ) {
        // Then they might be using something like "!mjolnir status"
        return startingTableEntry;
      }
      const entry = startingTableEntry.subCommands?.get(nextArgument.object);
      if (!entry) {
        // The reason there's no match is because this is the command arguments, rather than subcommand notation.
        return startingTableEntry;
      } else {
        stream.readItem(); // dispose of the argument.
        return tableHelper(entry, argumentStream);
      }
    };
    return tableHelper(this.commands, stream);
  }

  public findAMatchingCommand(
    stream: PresentationArgumentStream
  ): CommandDescription | undefined {
    const commandTableEntry = stream.savingPositionIf({
      body: (s) =>
        this.findAMatchingCommandEntry(s as PresentationArgumentStream),
      predicate: (command) => command === undefined,
    });
    if (commandTableEntry) {
      return commandTableEntry.currentCommand;
    }
    return undefined;
  }

  private internCommandHelper(
    command: CommandDescription,
    originalTable: CommandTable,
    currentTableEntry: BaseCommandTableEntry,
    originalDesignator: string[],
    currentDesignator: string[]
  ): void {
    const currentDesignatorPart = currentDesignator.shift();
    if (currentDesignatorPart === undefined) {
      if (currentTableEntry.currentCommand) {
        throw new TypeError(
          `There is already a command for ${JSON.stringify(originalDesignator)}`
        );
      }
      currentTableEntry.currentCommand = command;
      if (originalTable === this) {
        this.exportedCommands.add(currentTableEntry as CommandTableEntry);
      }
      this.flattenedCommands.set(
        command,
        currentTableEntry as CommandTableEntry
      );
    } else {
      if (currentTableEntry.subCommands === undefined) {
        currentTableEntry.subCommands = new Map();
      }
      const nextLookupEntry =
        currentTableEntry.subCommands.get(currentDesignatorPart) ??
        ((lookup: BaseCommandTableEntry) => (
          currentTableEntry.subCommands.set(currentDesignatorPart, lookup),
          lookup
        ))({ designator: originalDesignator, sourceTable: this });
      this.internCommandHelper(
        command,
        originalTable,
        nextLookupEntry,
        originalDesignator,
        currentDesignator
      );
    }
  }

  public internCommand(
    command: CommandDescription,
    designator: string[]
  ): this {
    this.internCommandHelper(
      command,
      this,
      this.commands,
      designator,
      [...designator] // this array gets mutated.
    );
    return this;
  }

  public importTable(
    importedTable: CommandTable,
    baseDesignator: string[]
  ): void {
    for (const commandTableEntry of importedTable.getAllCommands()) {
      if (
        this.findAMatchingCommand(
          new StandardPresentationArgumentStream(
            commandTableEntry.designator.map((d) =>
              StringPresentationType.wrap(d)
            ) as Presentation[]
          )
        )
      ) {
        throw new TypeError(
          `Command ${JSON.stringify(commandTableEntry.designator)} is in conflict with this table and cannot be imported.`
        );
      }
    }
    this.importedTables.set(importedTable, {
      table: importedTable,
      baseDesignator,
    });
    for (const command of importedTable.getAllCommands()) {
      const designator = [...baseDesignator, ...command.designator];
      this.internCommandHelper(
        command.currentCommand,
        importedTable,
        this.commands,
        designator,
        [...designator] // this array gets mutated.
      );
    }
  }
  public isContainingCommand(command: CommandDescription): boolean {
    return this.flattenedCommands.has(command);
  }
  private keyFromTranslator(translator: PresentationTypeTranslator): string {
    return translator.toType.name + "From" + translator.fromType.name; // cheap but no one will ever find out.
  }
  public internPresentationTypeTranslator(
    translator: PresentationTypeTranslator
  ): CommandTable {
    const key = this.keyFromTranslator(translator);
    if (this.translators.has(key)) {
      throw new TypeError(
        `There is already a translator from ${translator.toType.name} to ${translator.fromType.name}`
      );
    }
    this.translators.set(key, translator);
    return this;
  }
  public findPresentationTypeTranslator(
    toType: PresentationType,
    fromType: PresentationType
  ): PresentationTypeTranslator | undefined {
    return this.translators.get(toType.name + "From" + fromType.name);
  }
}
