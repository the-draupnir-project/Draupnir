import { Ok, isError } from "matrix-protection-suite";
import { defineCommandTable, defineInterfaceCommand, findTableCommand } from "../../src/commands/interface-manager/InterfaceCommand";
import { ArgumentStream, findPresentationType, parameters, union } from "../../src/commands/interface-manager/ParameterParsing";
import { readCommand } from "../../src/commands/interface-manager/CommandReader";
import "../../src/commands/interface-manager/MatrixPresentations";

it('A command that fookin parses mxids', async function() {
    const tableName = Symbol("ParseTest");
    defineCommandTable(tableName);
    defineInterfaceCommand({
        designator: ["unban"],
        table: tableName,
        parameters: parameters([
            {
                name: "entity",
                acceptor: union(
                    findPresentationType("UserID"),
                    findPresentationType("MatrixRoomReference"),
                    findPresentationType("string")
                )
            }
        ],
        undefined,
        ),
        command: async function() {
            return Ok(undefined);
        },
        summary: "Mimicks the unban command"
    });
    const command = findTableCommand(tableName, "unban");
    const result = await command.parseThenInvoke(undefined, new ArgumentStream(readCommand("@spam:example.com")));
    if (isError(result)) {
        throw new TypeError(`Not supposed to be error mate`);
    }
})
