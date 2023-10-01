import { Protection } from "./Protection";
import { Mjolnir } from "../Mjolnir";
import { access, constants } from "fs/promises";
import { glob } from "glob";
import { LogLevel } from "matrix-bot-sdk";
import { Permalinks } from "../commands/interface-manager/Permalinks";
import fetch from "node-fetch";
import { YaraCompiler, YaraRule, YaraRuleMetadata, YaraRuleResult } from "@node_yara_rs/node-yara-rs";

export class YaraDetection extends Protection {
    private compiler: YaraCompiler;

    settings = {};

    constructor() {
        super();
    }

    private checkFileExists(folder: string) {
        return access(folder, constants.F_OK)
            .then(() => true)
            .catch(() => false)
    }

    private async getRules(mjolnir: Mjolnir): Promise<YaraRule[]> {
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
        if (!this.compiler) {
            console.log("Starting yara");
            try {
                this.compiler = new YaraCompiler(await this.getRules(mjolnir), []);
                console.log("Started yara");
            } catch (error) {
                if (error) {
                    mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, `Yara failed to compile some rules:\n${error}`);
                    return;
                }
            }
        }
        console.log("Loading yara scanner");
        const scanner = this.compiler.newScanner();

        // Check for media and download + scan it
        if (event['type'] === 'm.room.message') {
            const content = event['content'] || {};
            const msgtype = content['msgtype'] || 'm.text';
            const formattedBody = content['formatted_body'] || '';
            const isMedia = (msgtype !== 'm.text' && (content["url"] || content["info"]?.["thumbnail_url"])) || formattedBody.toLowerCase().includes('<img');
            if (isMedia) {
                // TODO: Decrypt files
                const file_url = content["url"];
                if (file_url) {
                    const media_url = mjolnir.client.mxcToHttp(file_url)
                    const response = await fetch(media_url);
                    const body = await response.buffer();
                    const result = scanner.scanBuffer(body);
                    this.handleScanResult(mjolnir, roomId, event, result);
                }

                if (content["info"]) {
                    const thumbnail_file_url = content["info"]["thumbnail_url"];
                    if (thumbnail_file_url) {
                        const media_url = mjolnir.client.mxcToHttp(thumbnail_file_url)
                        const response = await fetch(media_url);
                        const body = await response.buffer();
                        const result = scanner.scanBuffer(body);
                        this.handleScanResult(mjolnir, roomId, event, result);
                    }

                }
            }
        }
        // Scan message itself
        try {
            const result = scanner.scanString(JSON.stringify(event));
            await this.handleScanResult(mjolnir, roomId, event, result);
        } catch (error) {
            const eventPermalink = Permalinks.forEvent(roomId, event['event_id']);
            mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, `Yara failed:\nScan ${eventPermalink} failed: ${error.message}`);
        }
    }

    private async handleScanResult(mjolnir: Mjolnir, roomId: string, event: any, results: YaraRuleResult[]) {
        for (const result of results) {
            console.log(result)
            const action = result.metadatas.filter((meta_object: YaraRuleMetadata) => meta_object.identifier === "Action").map((meta_object: any) =>
                meta_object.value
            )[0]
            const notification_text = result.metadatas.filter((meta_object: YaraRuleMetadata) => meta_object.identifier === "NotifcationText").map((meta_object: any) =>
                meta_object.value
            )[0]

            if (action === "Notify") {
                await this.actionNotify(mjolnir, roomId, event, result, notification_text);
            } else if (action === "RedactAndNotify") {
                await mjolnir.client.redactEvent(roomId, event["event_id"]);
                this.actionNotify(mjolnir, roomId, event, result, notification_text)
            }
        }

    }

    /**
     * This method does issue a notification inside of the admin room that the specific rule was matched
     */
    private async actionNotify(mjolnir: Mjolnir, roomId: string, event: any, result: YaraRuleResult, notificationText?: string) {
        const eventPermalink = Permalinks.forEvent(roomId, event['event_id']);
        await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, this.name, `Yara matched for event ${eventPermalink}:\nScan ${result.identifier} found match: ${JSON.stringify(result.strings)}`);
        if (notificationText) {
            const userPermalink = Permalinks.forUser(event['sender']);
            await mjolnir.client.sendNotice(roomId, `${userPermalink}: ${notificationText}`);
        }
    }
}
