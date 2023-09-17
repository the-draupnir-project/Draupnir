import { Protection } from "./Protection";
import { Mjolnir } from "../Mjolnir";
import { CompileRulesError, createScanner, initializeAsync } from "yara";
import { access, constants } from "fs/promises";
import { glob } from "glob";
import { LogLevel } from "matrix-bot-sdk";

type Rule = {
    // The rule file location
    filename?: string;
    // The rule in string form
    string?: string;
}

export class YaraDetection extends Protection {
    private scanner = createScanner();
    private static isInitialized = false;

    settings = {};

    constructor() {
        super();
    }

    private checkFileExists(folder: string) {
        return access(folder, constants.F_OK)
            .then(() => true)
            .catch(() => false)
    }

    private async getRules(mjolnir: Mjolnir): Promise<Rule[]> {
        const argv = process.argv;
        const configOptionIndex = argv.findIndex(arg => arg === "--yara-rules");
        if (configOptionIndex > 0) {
            const configOptionPath = argv.at(configOptionIndex + 1);
            if (!configOptionPath) {
                mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, `No yara rules path provided with option --yara-rules`);
                return [];
            }
            if (!this.checkFileExists(configOptionPath)) {
                mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, "Yara path provided with --yara-rules need to exists");
                return [];
            }

            const files = await glob('**/*.yara', { cwd: configOptionPath, absolute: true });
            const rules = files.map((file) => {
                return {
                    filename: file,
                }
            });
            return rules;
        } else {
            mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, `No yara rules path provided with option --yara-rules`);
            return [];
        }
    }

    public get name(): string {
        return 'YaraDetection';
    }

    public get description(): string {
        return "Match all events against the yara rules in the yara folder which is defined with --yara-rules.";
    }

    public async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<any> {
        // We take the longer time on first startup to have a little cleaner setup.
        if (!YaraDetection.isInitialized) {
            console.log("Starting yara");
            const error = await initializeAsync();
            if (error) {
                console.error(error.message);
                return;
            } else {
                const rules = await this.getRules(mjolnir);
                console.log(`Loading rules: ${JSON.stringify(rules)}`)
                const { error, warnings } = await this.scanner.configureAsync({ rules: await this.getRules(mjolnir) });
                if (error) {
                    if (error instanceof CompileRulesError) {
                        // @ts-ignore The typings are sadly incorrect. See https://github.com/Automattic/node-yara/issues/33
                        mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, `Yara failed to compile some rules:\n${error.message}: ${JSON.stringify(error.errors)}`);
                    } else {
                        mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, `Yara failed:\n${error}`);
                    }
                    return;
                }
                if (warnings) {
                    mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, this.name, `Yara warned:\n${warnings}`);
                }
                YaraDetection.isInitialized = true;
            }
        }

        // TODO: get media and also test the files
        const result = await this.scanner.scanAsync({ buffer: Buffer.from(JSON.stringify(event), 'utf8') });
        // FIXME: Untested
        if (result?.error) {
            //mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, `Yara failed:\nScan ${path} failed: ${error.message}`);
        }

        if (result?.rules?.length > 0) {
            for (const rule of result.rules) {
                mjolnir.managementRoomOutput.logMessage(LogLevel.INFO, this.name, `Yara matched:\nScan ${rule.id} found match: ${JSON.stringify(rule.matches)}`);
            }
        }
    }
}
