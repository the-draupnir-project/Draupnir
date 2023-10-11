import { Protection } from "./Protection";
import { Mjolnir } from "../Mjolnir";
import { access, constants } from "fs/promises";
import { globSync } from "glob";
import { LogLevel } from "matrix-bot-sdk";
import { Permalinks } from "../commands/interface-manager/Permalinks";
import fetch from "node-fetch";
import { YaraCompiler, YaraRule, YaraRuleMetadata, YaraRuleResult } from "@node_yara_rs/node-yara-rs";
import { StringListProtectionSetting, StringProtectionSetting } from "./ProtectionSettings";
import { EntityType } from "../models/ListRule";

export class YaraDetection extends Protection {
    private compiler?: YaraCompiler;

    public async registerProtection(mjolnir: Mjolnir): Promise<void> {
        this.compiler = new YaraCompiler(YaraDetection.getRules(mjolnir), []);
        return;
    }

    settings = {
        banPolicyList: new RoomIDSetProtectionSetting(),
        disabledTags: new StringListProtectionSetting()
    };

    constructor() {
        super();
    }

    private static checkFileExists(folder: string) {
        return access(folder, constants.F_OK)
            .then(() => true)
            .catch(() => false)
    }

    private static getRules(mjolnir: Mjolnir): YaraRule[] {
        const argv = process.argv;
        const configOptionIndex = argv.findIndex(arg => arg === "--yara-rules");
        if (configOptionIndex > 0) {
            const configOptionPath = argv.at(configOptionIndex + 1);
            if (!configOptionPath) {
                mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, `No yara rules path provided with option --yara-rules`);
                return [];
            }
            if (!YaraDetection.checkFileExists(configOptionPath)) {
                mjolnir.managementRoomOutput.logMessage(LogLevel.ERROR, this.name, "Yara path provided with --yara-rules need to exists");
                return [];
            }

            const files = globSync('**/*.yara', { cwd: configOptionPath, absolute: true });
            const rules: YaraRule[] = files.map((file) => {
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
        console.log("Loading yara scanner");
        if (this.compiler) {
            const scanner = this.compiler?.newScanner();

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
        } else {
            console.error("Failed to setup yara protection")
        }

    }

    private async handleScanResult(mjolnir: Mjolnir, roomId: string, event: any, results: YaraRuleResult[]) {
        for (const result of results) {
            if (result.tags.some(tag => this.settings.disabledTags.value.includes(tag))) {
                continue;
            }

            const action = result.metadatas.filter((meta_object: YaraRuleMetadata) => meta_object.identifier === "Action").map((meta_object: YaraRuleMetadata) =>
                meta_object.value as string
            )[0]
            const notification_text = result.metadatas.filter((meta_object: YaraRuleMetadata) => meta_object.identifier === "NotifcationText").map((meta_object: YaraRuleMetadata) =>
                meta_object.value as string
            )[0]
            const reason_text = result.metadatas.filter((meta_object: YaraRuleMetadata) => meta_object.identifier === "Reason").map((meta_object: YaraRuleMetadata) =>
                meta_object.value as string
            )[0]

            if (action === "Notify") {
                await this.actionNotify(mjolnir, roomId, event, result, notification_text);
            } else if (action === "RedactAndNotify") {
                await mjolnir.client.redactEvent(roomId, event["event_id"]);
                this.actionNotify(mjolnir, roomId, event, result, notification_text);
            } else if (action === "Kick") {
                await this.actionKick(mjolnir, roomId, event, result, reason_text);
            } else if (action === "Silence") {
                await this.actionSilence(mjolnir, roomId, event, result)
            } else if (action === "Ban") {
                await this.actionBan(mjolnir, roomId, event, result, reason_text);
            }
        }

    }

    private async actionKick(mjolnir: Mjolnir, roomId: string, event: any, result: YaraRuleResult, kickReason?: string) {
        await mjolnir.client.redactEvent(roomId, event["event_id"]);
        await mjolnir.client.kickUser(event["sender"], roomId, kickReason);
        const eventPermalink = Permalinks.forEvent(roomId, event['event_id']);
        await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, this.name, `Yara matched for event ${eventPermalink} and kicked the User:\nScan ${result.identifier} found match: ${JSON.stringify(result.strings)}`);
    }

    private async actionBan(mjolnir: Mjolnir, roomId: string, event: any, result: YaraRuleResult, ban_reason?: string) {
        const eventPermalink = Permalinks.forEvent(roomId, event['event_id']);

        if (!this.settings.banPolicyList.value) {
            await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, this.name, `Yara matched for event ${eventPermalink} but was unable to ban the user since there is no policy list for bans configured:\nScan ${result.identifier} found match: ${JSON.stringify(result.strings)}`);
        }

        await mjolnir.client.redactEvent(roomId, event["event_id"]);
        await mjolnir.policyListManager.lists.find(list => list.roomId == this.settings.banPolicyList.value)?.banEntity(EntityType.RULE_USER, event["sender"], ban_reason ?? "Automatic ban using Yara Rule");
        await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, this.name, `Yara matched for event ${eventPermalink} and banned the User:\nScan ${result.identifier} found match: ${JSON.stringify(result.strings)}`);
    }

    private async actionSilence(mjolnir: Mjolnir, roomId: string, event: any, result: YaraRuleResult) {
        await mjolnir.client.redactEvent(roomId, event["event_id"]);
        const power_levels = await mjolnir.client.getRoomStateEvent(roomId, "m.room.power_levels", "");
        if (power_levels) {
            const events_default = power_levels["events_default"];
            const events = power_levels["events"];
            if (events) {
                const message_level = events["m.room.message"];
                if (message_level) {
                    await mjolnir.client.setUserPowerLevel(event["sender"], roomId, message_level - 1);
                } else {
                    await mjolnir.client.setUserPowerLevel(event["sender"], roomId, message_level - 1);
                }
            } else {
                await mjolnir.client.setUserPowerLevel(event["sender"], roomId, events_default - 1);
            }
        } else {
            await mjolnir.client.setUserPowerLevel(event["sender"], roomId, -1);
        }

        const eventPermalink = Permalinks.forEvent(roomId, event['event_id']);
        await mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, this.name, `Yara matched for event ${eventPermalink} and silenced the User:\nScan ${result.identifier} found match: ${JSON.stringify(result.strings)}`);
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

// A list of strings that match the glob pattern !*:*
export class RoomIDSetProtectionSetting extends StringProtectionSetting {
    // validate an individual piece of data for this setting - namely a single mxid
    validate = (data: string) => /^!\S+:\S+$/.test(data);
}
