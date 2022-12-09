import { readCommand, ReadItem } from "../../src/commands/interface-manager/CommandReader";
import { paramaters } from "../../src/commands/interface-manager/ParamaterParsing";
import { ValidationError, ValidationResult } from "../../src/commands/interface-manager/Validation";
import expect from "expect";

describe('The argument parser goddamn works', function() {
    it('can parse a simple argument list', function() {
        const paramaterDescription = paramaters([
            (item: ReadItem) => {
                if (typeof item === 'string') {
                    return ValidationResult.Ok(true)
                } else {
                    return ValidationError.Result('invalid', 'was expecting a string here m8');
                }
            }
        ]);
        expect(paramaterDescription(...readCommand("hello")).ok).toBe(true);
        // hmm what about providing too many arguments when there's no rest?
        // how to conveniently test all the edge cases?
    })
})