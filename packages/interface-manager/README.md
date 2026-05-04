<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: Apache-2.0
-->

# @the-draupnir-project/interface-manager

This library provides a command-oriented presentation interface for Matrix bots.
This is the library used by
[Draupnir](https://github.com/the-draupnir-project/Draupnir) to provide command
parsing, rendering and interaction prompts.

This library also includes a `JSXFactory` that can transform JSX templates into
`org.matrix.custom.html` and plain text fallback, so that it is possible to send
Matrix events from one source.

```typescript
const KickCommand = describeCommand({
  summary: "A command to test keyword arguments",
  parameters: tuple({
    name: "user",
    acceptor: MatrixUserIDPresentationType,
  }),
  keywords: {
    keywordDescriptions: {
      glob: {
        isFlag: true,
        description:
          "Allows globs to be used to kick several users from rooms.",
      },
    },
  },
  async executor(
    draupnir: Draupnir,
    _info,
    keywords
  ): Promise<Result<KickedUsers>> {
    return await draupnir.kickUsers(
      user,
      keywords.getKeywordValue("glob", false)
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(
  KickCommand,
  {
    JSXRenderer(result) {
      if (isError(result)) {
        return Ok(undefined);
      }
      return Ok(
        <root>
          <details>
            <summary>Removed {result.ok.length} users from protected rooms.</summary>
            {renderKickedUsers(result.ok)}
          </details>
        </root>
      );
    }
  }
);
```

## Getting started

At some point in the near future we will create a simple bot that will act as a
template repository that can be copied and edited.

In the meantime Draupnir's glue/setup code for the library can be found
[here](https://github.com/the-draupnir-project/Draupnir/blob/main/src/commands/interface-manager/MPSMatrixInterfaceAdaptor.ts)
and this code is licensed under Apache-2.0.

## Contributing & Opening Issues

Draupnir wants to be yours as much as it is ours. Please see or
[contributing document](https://the-draupnir-project.github.io/draupnir-documentation/contributing),
but do not worry too much about following the guidance to the letter. And keep
that in mind throughout.

## Supported by

### NLnet foundation

<p>
  <img src="https://nlnet.nl/logo/banner.svg" width="25%" hspace="10">
  <img src="https://nlnet.nl/image/logos/NGI0Core_tag.svg" width="25%" hspace="10">
</p>

Draupnir is supported by the NLnet foundation and
[NGI Zero](https://nlnet.nl/NGI0/) under the
[NGI Zero Core](https://nlnet.nl/core/) programme.

You can find details of the work that is being supported from NLnet
[here](https://nlnet.nl/project/Draupnir/) and the goals
[here](https://marewolf.me/posts/draupnir/24-nlnet-goals.html).
