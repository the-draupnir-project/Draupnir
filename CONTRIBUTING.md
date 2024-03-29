# Contributing code to Draupnir

## How to contribute

The preferred and easiest way to contribute changes to Matrix is to fork the
relevant project on github, and then [create a pull request](
https://help.github.com/articles/using-pull-requests/) to ask us to pull
your changes into our repo.

We use Github Actions for continuous integration.
If your change breaks the build, this will be shown in GitHub, so
please keep an eye on the pull request for feedback.

## How Draupnir works

You should read the [context document](./docs/context.md).

## Development

To run unit tests in a local development environment, you can use `yarn test`
and `yarn lint`.

### mx-tester

For integration testing, and spinning up a local synapse we use
[mx-tester](https://github.com/matrix-org/mx-tester).
While not required for basic changes, it is strongly recommended
to use mx-tester or have the ability to spin up your own
development Synapse to develop mjolnir interactively.

To install `mx-tester` you will need the [rust toolchain](https://rustup.rs/)
and Docker. You should refer to your linux distribution's documentation
for installing both, and do not naively follow the instructions
from rustup.rs without doing so first.
Then you will be able to install `mx-tester` with `cargo install mx-tester`.
Updating mx-tester can be done by installing `cargo install cargo-update`
and using `cargo install-update mx-tester`, though you may skip
this step until it is necessary to update `mx-tester`.

#### Usage

You can then start a local synapse using `mx-tester build`,
followed by `mx-tester up`. You can then use `up`, `down` as many
times as you like.
If for some reason you need to get a clean Synapse database,
you can just use `mx-tester down build`.

### Debugging

For debugging mx-tester it is recommended to use Visual Studio Code.
If you open the project in visual studio code, press `F1`,
type `Debug: JavaScript Debug Terminal`
(see the [documentation](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_javascript-debug-terminal)),
and you should get a terminal from which node will always connect to
Visual Studio Code.

The following sections assume that a Synapse is running
and `config/harness.yaml` has been configured to connect to it.
If you are using `mx-tester` and you use `mx-tester up`, this will
already be the case.

#### Debugging and reproducing an issue

If you need to debug an issue that is occurring through use in matrix,
say the unban command has stopped working, you can launch
mjolnir from the JavaScript Debug Terminal using `yarn test:manual`.
This will launch mjolnir using the config found in `config/harness.yaml`.
You can now open https://app.element.io, change the server to `localhost:8081`,
and then create an account.
From here you can join the room `#moderators:localhost:9999` (you will also be
able to find it in the rooms directory) and interact with mjolnir.

It is recommended to set breakpoints in the editor while interacting
and switch the tab to "DEBUG CONSOLE" (within Visual Studio Code)
to evaluate arbitrary expressions in the currently paused context (when
a breakpoint has been hit).

#### Debugging an integration test

To debug the integration test suite from the JavaScript Debug Terminal,
you can start them using `yarn test:integration`.
However, more often than not there is a specific section of
code you will be working on that has specific tests. Running
the entire suite is therefore unnecessary.
To run a specific test from the JavaScript Debug Terminal,
you can use the script `yarn test:integration:single test/integration/banListTest.ts`,
where `test/integration/banListTest.ts` is the name of the integration test you
want to run.

## Code style

All Matrix projects have a well-defined code-style - and sometimes we've even
got as far as documenting it... Mjolnir's code style is a relatively standard
TypeScript project - run `yarn lint` to see how your code fairs.

Before pushing new changes, ensure they don't produce linting errors.

Please ensure your changes match the cosmetic style of the existing project,
and **never** mix cosmetic and functional changes in the same commit, as it
makes it horribly hard to review otherwise.

## Sign off

In order to have a concrete record that your contribution is intentional
and you agree to license it under the same terms as the project's license, we've adopted the
same lightweight approach that the Linux Kernel
[submitting patches process](
https://www.kernel.org/doc/html/latest/process/submitting-patches.html#sign-your-work-the-developer-s-certificate-of-origin>),
[Docker](https://github.com/docker/docker/blob/master/CONTRIBUTING.md), and many other
projects use: the DCO (Developer Certificate of Origin:
http://developercertificate.org/). This is a simple declaration that you wrote
the contribution or otherwise have the right to contribute it to Matrix:

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.
660 York Street, Suite 102,
San Francisco, CA 94110 USA

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

If you agree to this for your contribution, then all that's needed is to
include the line in your commit or pull request comment:

```
Signed-off-by: Your Name <your@email.example.org>
```

We accept contributions under a legally identifiable name, such as
your name on government documentation or common-law names (names
claimed by legitimate usage or repute). Unfortunately, we cannot
accept anonymous contributions at this time.

Git allows you to add this signoff automatically when using the `-s`
flag to `git commit`, which uses the name and email set in your
`user.name` and `user.email` git configs.

## Conclusion

That's it! Matrix is a very open and collaborative project as you might expect
given our obsession with open communication. If we're going to successfully
matrix together all the fragmented communication technologies out there we are
reliant on contributions and collaboration from the community to do so. So
please get involved - and we hope you have as much fun hacking on Matrix as we
do!

## Further notes on license and its relation to business in general

Ultimately most open source software contributions start by gifting
labour without any obligation or transaction.

There is no ethical way to directly sell this labour.

Many so called post open source[^post-open-source] ideas fixate on
finding a way to conduct business in an ethical way,
and this is problematic.

Once you start working within capitalism with capitalism, and exchange
your power and influence over a work to monitize the work itself,
the work will gain inertia and a power of its own that you cannot control.
You will work for the work, for external interests, and these won't
be the interests of your powerless users who you were among to begin with.

It would be extreme, but I am tempted to suggest that by performing a
buisness this way, you are part of an effort
which not only reinforces capitalism but works to make it more
efficient. Effectively working to make capitalism more powerful.
Congratulations.

Another point that is often brought up in these discussions is how
software licensing relies on an appeal to state power, the power of
the law.

Therefore I propose a new licensing model, one which appeals
to the power of public pressure rather than the law.

Such a license would be liberal, allowing incorperation into
proprietary works provided it retained a notice.
However, any work which is used in any way to conduct business must
report all software being used by the buisness with this license,
all turnover made by the buisness, all profit made by the buisness
and an estimation of both profit and turnover made by the buisness in
relation to the collection of software reported.

It is not clear to me how often these figures should be reported
and when, or even where they should be reported to (ideally they could
be found centrally). It is also unclear how to create the legalise
required.

With the information these licenses would provide, public pressure
could then be used to demand reperations for the profits made by
pillaging and destructive businesses.
It is not clear yet how any reperations would be distributed,
probably through some system of
[venture communes](https://wiki.p2pfoundation.net/Venture_Commune).
The idea is to ensure that the developers and users of projects
would not be distracted from providing each other mutual
support and to give them a hope of escaping.

[^post-open-source] https://applied-langua.ge/posts/the-poverty-of-post-open-source.html.
