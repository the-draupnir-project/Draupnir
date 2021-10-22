/*
Copyright 2019-2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import BanList, { ChangeType, ListRuleChange, RULE_ROOM, RULE_SERVER, RULE_USER } from "./BanList"
import { v4 as uuidv4 } from 'uuid';
import { LogService } from "matrix-bot-sdk";
import { ListRule } from "./ListRule";

export const USER_MAY_INVITE = 'user_may_invite';
export const CHECK_EVENT_FOR_SPAM = 'check_event_for_spam';

/**
 * Rules in the RuleServer format that have been produced from a single event.
 */
class EventRules {
    constructor (readonly eventId: string,
    readonly roomId: string,
    readonly ruleserverRules: RuleserverRule[]) {
    }
}

/**
 * A description of the properties that should be checked as part of a RuleserverRule.
 */
interface Checks {
    property: string;
}

/**
 * A Rule served by the ruleserver.
 */
interface RuleserverRule {
    // A unique identifier for this rule.
    readonly id: string
    readonly description?: string
    readonly checks: Checks
}

/**
 * The RuleServer is an experimental server that is used to propogate the rules of the watched policy rooms (BanLists) to
 * homeservers (or e.g. synapse modules).
 * This is done using an experimental format that is heavily based on the "Spam Checker Callbacks" made available to
 * synapse modules https://matrix-org.github.io/synapse/latest/modules/spam_checker_callbacks.html.
 *
 */
export default class Ruleserver {
    // Each token is an index for a row of this two dimensional array. Each row represents the rules that were added during the lifetime of that token.
    private policies: EventRules[][] = [[]];
    private stoppedRules: string[][] = [[]];
    // We use this to quickly lookup if we have stored a policy without scanning the list. The key is the event id of a policy rule.
    private internedPolicies: Map<string, EventRules> = new Map();
    // A unique identifier for this server instance that is given to each response so we can tell if the token
    // was issued by this server or not. This is important for when Mjolnir has been restarted
    // but the client consuming the rules hasn't been and we need to tell the client we have rebuilt all of the rules (via `reset` in the response).
    private serverId: string = uuidv4();
    private currentToken = 0;

    /**
     * The token is used to seperate EventRules from each other based on when they were added.
     * The lower the token, the longer a rule has been tracked for (relative to other rules in this Ruleserver).
     * The token is incremented before adding new rules to be served.
     */
    private nextToken(): void {
        this.currentToken += 1;
        this.stoppedRules.push([]);
        this.policies.push([]);
    }

    /**
     * Get a combination of the serverId and currentToken to give to the client.
     */
    private get since(): string {
        return `${this.serverId}::${this.currentToken}`;
    }

    /**
     * Add the EventRule to be served by the ruleserver at the current token.
     * @param eventRules Add rules for an associated policy room event. (e.g. m.policy.rule.user).
     */
    private addEventRules(eventRules: EventRules): void {
        if (this.internedPolicies.has(eventRules.eventId)) {
            throw new Error(`There is already an entry in the RuleServer for rules created from the event ${eventRules.eventId}.`);
        }
        this.internedPolicies.set(eventRules.eventId, eventRules);
        this.policies[this.currentToken].push(eventRules);
    }

    /**
     * Stop serving the rules from this policy rule.
     * @param eventRules The EventRules to stop serving from the ruleserver.
     */
    private stopEventRules(eventRules: EventRules): void {
        const eventId = eventRules.eventId;
        this.internedPolicies.delete(eventId);
        this.policies.map(tokenPolicies => {
            const index = tokenPolicies.indexOf(eventRules);
            if (index > -1) {
                tokenPolicies.splice(index, 1);
            }
        });
        eventRules.ruleserverRules.map(rule => this.stoppedRules[this.currentToken].push(rule.id));
    }

    /**
     * Update the ruleserver to reflect the ListRule change.
     * @param change A ListRuleChange sourced from a BanList.
     */
    private applyRuleChange(change: ListRuleChange): void {
        if (change.changeType === ChangeType.Added) {
            const eventRules = new EventRules(change.event.event_id, change.event.room_id, toRuleServerFormat(change.rule));
            this.addEventRules(eventRules);
        } else if (change.changeType === ChangeType.Modified) {
            const entry: EventRules|undefined = this.internedPolicies.get(change.previousState.event_id);
            if (entry === undefined) {
                LogService.error('RuleServer', `Could not find the rules for the previous modified state ${change.event['state_type']} ${change.event['state_key']} ${change.previousState?.event_id}`);
                return;
            }
            this.stopEventRules(entry);
            const eventRules = new EventRules(change.event.event_id, change.event.room_id, toRuleServerFormat(change.rule));
            this.addEventRules(eventRules);
        } else if (change.changeType === ChangeType.Removed) {
            // When a redaction has happened, the unredacted version of the redacted event is in the previousState, the same event
            // will be in the event slot (of RuleChange) with the redaction applied.
            // When an event has been "soft redacted" (a new event with the same state keys with no content),
            // the events in the previousState and event slots will be distinct events.
            // In either case we can therefore use previousState to get the right event id to stop.
            const entry: EventRules|undefined = this.internedPolicies.get(change.previousState.event_id);
            if (entry === undefined) {
                LogService.error('RuleServer', `Could not find the rules for the previous modified state ${change.event['state_type']} ${change.event['state_key']} ${change.previousState?.event_id}`);
                return;
            }
            this.stopEventRules(entry);
        }
    }

    /**
     * Process the changes that have been made to a BanList, this will ususally be called as a callback from `BanList.onChange`.
     * @param banList The BanList that the changes happened in.
     * @param changes An array of ListRuleChanges.
     */
    public update(banList: BanList, changes: ListRuleChange[]) {
        if (changes.length > 0) {
            this.nextToken();
            changes.forEach(this.applyRuleChange, this);
        }
    }

    /**
     * Get all of the new rules since the token.
     * @param sinceToken A token that has previously been issued by this server.
     * @returns An object with the rules that have been started and stopped since the token and a new token to poll for more rules with.
     */
    public getUpdates(sinceToken: string | null): {start: RuleserverRule[], stop: string[], reset?: boolean, since: string} {
        const updatesSince = <T = EventRules|string>(token: number | null, policyStore: T[][]): T[] => {
            if (token === null) {
                return policyStore.flat();
            } else {
                if (token === this.currentToken) {
                    return [];
                } else {
                    return policyStore.slice(token).flat();
                }
            }
        }
        const [serverId, since] = sinceToken ? sinceToken.split('::') : [null, null];
        const parsedSince: number | null = since ?  parseInt(since, 10) : null;
        if (serverId && serverId !== this.serverId) {
            return {
                start: updatesSince(null, this.policies).map((e: EventRules) => e.ruleserverRules).flat(),
                stop: updatesSince(null, this.stoppedRules),
                since: this.since,
                reset: true
            }
        } else {
            return {
                start: updatesSince(parsedSince, this.policies).map((e: EventRules) => e.ruleserverRules).flat(),
                stop: updatesSince(parsedSince, this.stoppedRules),
                since: this.since,
            }
        }
    }
}

/**
* Convert a ListRule into the format that can be served by the ruleserver.
* @param policyRule A ListRule to convert.
* @returns An array of rules that can be served from the ruleserver.
*/
function toRuleServerFormat(policyRule: ListRule): RuleserverRule[] {
   function makeLiteral(literal: string) {
       return {literal}
   }

   function makeGlob(glob: string) {
       return {glob}
   }

   function makeServerGlob(server: string) {
       return {glob: `:${server}`}
   }

   function makeRule(object) {
       return {
           id: uuidv4(),
           checks: object
       }
   }
   if (policyRule.kind === RULE_USER) {
       return [{
           property: USER_MAY_INVITE,
           user_id: [makeGlob(policyRule.entity)]
       },
       {
           property: CHECK_EVENT_FOR_SPAM,
           sender: [makeGlob(policyRule.entity)]
       }].map(makeRule)
   } else if (policyRule.kind === RULE_ROOM) {
       return [{
           property: USER_MAY_INVITE,
           'room_id': [makeLiteral(policyRule.entity)]
       },
       {
           property: CHECK_EVENT_FOR_SPAM,
           'room_id': [makeLiteral(policyRule.entity)]
       }].map(makeRule)
   } else if (policyRule.kind === RULE_SERVER) {
       return [{
           property: USER_MAY_INVITE,
           user_id: [makeServerGlob(policyRule.entity)]
       },
       {
           property: CHECK_EVENT_FOR_SPAM,
           sender: [makeServerGlob(policyRule.entity)]
       }].map(makeRule)
   } else {
       return []
   }
}