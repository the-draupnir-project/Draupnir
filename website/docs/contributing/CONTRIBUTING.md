# Contributing to Draupnir

## Welcome

Hi, thank you for considering to contribute to Draupnir.
We want this process to be as welcoming as possible, no matter your
experience level, or the kind of contribution that you want to make.

If you believe that your experience is anything but that, please let
us know!

Do not worry about following the guidance in this document to the
letter, we'd much rather you get involved than avoid doing so
because of a technicality. Please keep this in mind throughout.

## Getting Started

What kind of contribution are you trying to make?

If you are looking to document an issue, request a feature, develop
a feature, please proceed into the [Issue](#issue) section.

If you are looking to develop or contribute a fix, feature,
or documentation for an existing issue, please proceed to the
[Fixing or implementing an existing issue](#fixing-or-implementing-an-existing-issue) section.

### Issue

If you can, just open the issue on the repository and we'll see it
and come speak to you.

Alternatively, if you aren't comfortable doing so or can't phrase
the problem or feature, then come speak to us in our support room.
We'll probably end up creating the issue for you!

In either case, you should join our support room [#draupnir:matrix.org](https://matrix.to/#/#draupnir:matrix.org) :3

Do not worry about making duplicates or alignment with project
goals, the triage process is supposed to find that for you.

### Fixing or implementing an existing issue

If we have triaged the issue, even without writing our own context or
clarifications, then the issue is likely ready to implement.

You should write a small statement in the issue or a quick message to
our support room about how you intend to resolve the issue before getting
started.

If you don't know how to get started or what to change, please ask!
We'd love nothing more than to help you, or at the least, make
our documentation and process better.

## Where to start

Join our room [#draupnir:matrix.org](https://matrix.to/#/#draupnir:matrix.org)!

### How Draupnir works

Checkout our [context document](./context.md).

### Code

Checkout our [development guide](./development.md).

### Issues & Triaging

We don't have a specific guide for opening issues, just go ahead.

You can read about our issue triaging process [here](./triaging.md)

### Documentation

WIP, our documentation isn't great!

If you know how we can improve that then let us know!

Currently we just have markdown documents, but maybe we need
something more complete? like a markdown book?

Go ahead and edit anything.

## Making Pull Requests

The preferred and easiest way to contribute changes to Matrix is to fork the
relevant project on github, and then [create a pull request](
https://help.github.com/articles/using-pull-requests/) to ask us to pull
your changes into our repo.

We use Github Actions for continuous integration.
If your change breaks the build, this will be shown in GitHub, so
please keep an eye on the pull request for feedback.

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
