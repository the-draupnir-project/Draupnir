# Yara Protection

The Yara Protection provides a more advanced way to build pattern matching for events.

It is built above the existing tooling from <https://virustotal.github.io/yara/>.

## Enabling the Protection

First, make sure you add `--yara-rules` to your start command of draupnir.
This argument takes a path to the place where it will load yara rule files
(files ending in `.yara`) from.

Then in your admin room:

```
!draupnir enable YaraDetection
```

## Setting up the policy list

For some actions, you will need access to a policy list. Therefore, you can set
a setting that includes the roomID of your policy list as a value:

```
!mjolnir config set YaraDetection.banPolicyList <roomID>
```

Currently, it is only used for bans. However, this may be extended in the future.

## Temporary disabling rules

Rules can temporarily disabled by using tags.

Then in matrix in your admin room you can use

```
!mjolnir config add YaraDetection.disabledTags <tag>
```

to add tags which should be disabled.

Note that these are filtered _after_ the yara rules are executed currently.

## Writing Matrix Compatible YARA rules

### Available Actions

Firstly, we have a few possible actions we can take with the YARA rules.
These are all metadata in the YARA world, as shown in the next section.

Possible Actions are:

#### Notify

This causes a notification that a rule has been matched in the admin room.

If you also set `NotifcationText` it will additionally notify the user in the room.

As an example:

```yara
rule TestRule : test_rule
{
    meta:
        Author = "MTRNord"
        Description = "Test Rule"
        hash = "06fdc3d7d60da6b884fd69d7d1fd3c824ec417b2b7cdd40a7bb8c9fb72fb655b"
        Action = "Notify"
    strings:
        $test_string = "Test" ascii nocase

    condition:
        $test_string
}
```

This will cause a notification in the admin room if `Test` in any casing is matched in an event.

### RedactAndNotify

This behaves like the normal `Notify`, but also redacts the event that has been matched.

### Kick and Ban

Kick and Ban both take optional `Reason` metadata. This allows you to set, in the case of a kick, the reason field of the event, and in the case of a ban, it will set
the reason for the policy list event.

Both actions will additionally redact the event that matched.

Bans can be reverted by using the regular unban flow.

### Silence

Silencing a user means it will first get their message redacted, and after that, it
will not be kicked or banned, but the permissions to write will be removed for the user that sent the matched event.

## Activated yara modules

The yara integration is built on top of <https://github.com/MTRNord/node-yara-rs/>.
This means that at the time of writing, the following yara modules are available:

- `json` (Not available on windows)
- `pe`
- `elf`
- `hash`
- `math`
- `time`
- `console` (However this is not hooked to draupnir currently)
- `string`
- `lnk`

// TODO: Verify if this is actually true

## The json module

Since the json module is a non-standard module, here is a short introduction to the available functions and how to use it in matrix context.

As with other modules in yara you can import it by writing `import "json"` at
the top of your yara file.

The module brings the following conditional expressions:

- `json.key_exists("<key>")` - Allows you to check a key or nested key (delimited
by dots. Escape dots which do not define levels as `\\.` for example `m\\.mentions`)
- `json.value_exists("<key>", "<value>")` - Checks if a value exists. This can be
a string, a float, an integer, or a regex expression.
- `json.array_includes("<key>", "<value>")` - Checks if an array of strings
contains the value.
- `json.get_string_value("<key>")` - Gets the value of a key if its a string
- `json.get_integer_value("<key>")` - Gets the value of a key if its an integer
- `json.get_float_value("<key>")` - Gets the value of a string if its a float

### Example

This example matches for "Test" in any casing if the event is of msgtype `m.text`

```yara
rule TestRule : test_rule
{
    meta:
        Author = "MTRNord"
        Description = "Test Rule"
        hash = "06fdc3d7d60da6b884fd69d7d1fd3c824ec417b2b7cdd40a7bb8c9fb72fb655b"
        Action = "Notify"
    strings:
        $test_string = "Test" ascii nocase

    condition:
        $test_string and json.value_exists("content.msgtype", "m.text")
}
```

## Writing a YARA rule - A short guide

_For more advanced concepts, please also read <https://yara.readthedocs.io/en/stable/writingrules.html>_

Yara rules are a concept that is primarily used in the virus detection world.
Hence, some things might be less useful for Matrix. We are going to focus
on some simple matrix-specific concepts in this short guide.

### What are YARA rules even?

Yara rules are essentially a way to fingerprint data or more specifically match
patterns in data. You can think about it as a more expressive way to write a boolean
expression.

### How are they structured

Yara rules are similar to what you would call a function or method in languages.
It always starts with `rule <rule_name> : <tags>` and then has curly braces around
the condition itself.

After this basic structure you find up to 3 sections. `meta` which describes the
rule itself and in case of Draupnir is used to add information for how Draupnir
is supposed to evaluate the results of the rule, `strings` which define patterns
which should be matched for. These can many different kinds like plain strings,
byte patterns or regular expressions. Last but not least is the `condition` section,
which is used to define the actual condition. Here you would tell it where the logical
connections between multiple strings happen or if a string should be matched multiple times.

### An example - Matching long audio messages

As an example we are going to build a simple rule to match audio messages and then
check their length. As a result we will tell Draupnir to issue a warning to the user.

#### What do we need to check for?

A quick look at <https://spec.matrix.org/v1.8/client-server-api/#maudio> gives us an overview what we need.

First we do want to check its a `msgtype` wit the value `m.audio`.
Then we also see there is a `duration` field. It is part of the AudioInfo which is under the `info` key.
The duration is also defined to be in milliseconds.

With this we can now start writing a condition.

#### Metadata

Before we go ahead of ourselfs though we want to define the metadata block.

Some useful things to always include are:

- `Author` - This is the person who wrote the rule. This helps to report bugs.
- `Description` - A sentence or two describing what this rule will do if used.
- `hash` - This is a hash for a file over at Virustotal which this rule will match.
This is very useful if you want to use the <https://yara-ci.cloud.virustotal.com/> since
it will use that value to verify your rule is working.
- `sharing` - This is useful if you intend to share rules with others. I suggest using this pattern:
<https://www.cisa.gov/news-events/news/traffic-light-protocol-tlp-definitions-and-usage> as it is very
easy to understand and easy to use. Keep in mind most of your rules likely should be marked as `TLP:RED`.
When in doubt always go for `TLP:RED`.

Additional to this metadata in Draupnir we also need an `Action`. This is used to make Draupnir act
on a certain rule result. Without this it won't do anything when a rule matches.

For our example we decided to go with the `Notify` value and a `NotificationText` since we
want to tell the sender about a match.

With this we have something like this:

```yara
rule match_audio_duration : event_type
{
    meta:
        Author = "MTRNord"
        Description = "Matches if the audio file is very long (longer than 1m) and notifies the user"
        Action = "Notify"
        NotificationText = "Hi, your media seems pretty long for this room. Consider sending audio files smaller than 1m of duration please."
}
```

#### Matching the event data

## Security Considerations

Yara seems really powerful at first sight. However, please note the following
very important things when starting to use it in your community:

- Yara is NOT a virus scanner. Do not use it as one! Yara is designed as a pattern
matching engine. This means that, while it can catch some silly things, it will not replace clamav or similar.
- Be mindful about published rules. Rules can easily be used against you if they are public.
A spammer can look at them, find their issues or even use existing tools to generate
spam, which does avoid the rules entirely. Be ABSOLUTE SURE if you publish any of your rules.
- Any message and media are being evaluated through yara. Make sure that your rules are
as lightweight as possible. Try to test them locally using the yara command line.
This yields various warnings about optimizing the rules. If you are not careful, you might Denial of Service your own protection.
