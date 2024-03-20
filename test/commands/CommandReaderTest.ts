import expect from "expect";
import { Keyword, readCommand } from "../../src/commands/interface-manager/CommandReader";
import { MatrixRoomAlias, MatrixRoomID } from "matrix-protection-suite";

describe("Can read", function() {
    it("Can read a simple command with only strings", function() {
        const command = "!mjolnir list rooms";
        const readItems = readCommand(command);
        expect(readItems.every(item => command.includes(item as string))).toBe(true);
    });
    it("Can turn room aliases to room references", function() {
        const command = "#meow:example.org";
        const readItems = readCommand(command);
        expect(readItems.at(0)).toBeInstanceOf(MatrixRoomAlias);
        const roomReference = readItems.at(0) as MatrixRoomAlias;
        expect(roomReference.toRoomIDOrAlias()).toBe(command);
    });
    it("Can turn room ids to room references", function() {
        const command = "!foijoiejfoij:example.org";
        const readItems = readCommand(command);
        expect(readItems.at(0)).toBeInstanceOf(MatrixRoomID);
        const roomReference = readItems.at(0) as MatrixRoomID;
        expect(roomReference.toRoomIDOrAlias()).toBe(command);
    });
    it("Can read keywords and correctly parse their designators", function() {
        const checkKeyword = (designator: string, keyword: string) => {
            const readItems = readCommand(keyword);
            expect(readItems.at(0)).toBeInstanceOf(Keyword);
            const keywordItem = readItems.at(0) as Keyword;
            expect(keywordItem.designator).toBe(designator);
        }
        checkKeyword("foo", "--foo");
        checkKeyword("foo", "-foo");
        checkKeyword("f", "-f");
        checkKeyword("foo", ":foo");
        checkKeyword("f", ":f");
    });
    it("Check that malformed room ids and aliases are read as strings", function() {
        // We leave it for the command to validate the arguments it receives intentionally.
        // From the perspective of the user, their command will fail just as early but with more context this way.
        const checkMalformedRoomReference = (badReference: string) => {
            expect(readCommand(badReference).at(0)).toBe(badReference);
        }
        checkMalformedRoomReference("#singasongaboutlife");
        checkMalformedRoomReference("!mjolnir");
    })
})
