# Code style

For now we don't have many objective code recommendations.
Just try to stay consistent with the rest of the project,
if that is alien to you, it's ok, just try. In the worst case we will
clean things up for you.

We give some general advice about style below.

## Code style: optimisation

One of the most important things a Draupnir developer should do is let
to go of any tendencies that they may have towards micro optimisation.
We want clear code so much more than anything else, optimisation should
not be a concern at all when actually writing code.

If you are somewhat unseasoned, you may find this somewhat puzzling.

We believe the only way to effectively optimise is through design,
and the use of a profiler. There are very few things more inefficient
for programmers to work with than code written with overbearing
concerns about performance. Using idioms and data structures
appropriate for the programming language and problem being solved
will always be enough. And I invite you to believe that,
if micro optimisation is something you struggle with,
then tell yourself that it does not matter.

## Code style: scope

You might notice that we try to keep the scope (which by "scope"
here we really mean "how much stuff" is in a function/method)
as small as possible. This is something you should stick to aswell.

It really helps to introduce local functions if your method body starts
getting too large. I can't really tell you how large too large is,
but this quote captures the spirit well.

> A friend of mine was once interviewing an engineer for a programming
job and asked him a typical interview question: how do you know when a
function or method is too big? Well, said the candidate, I don't like
any method to be bigger than my head. You mean you can't keep all the
details in your head? No, I mean I put my head up against my monitor,
and the code shouldn't be bigger than my head.

(Quote from Peter Seibel's [Practical Common Lisp](https://gigamonkeys.com/book/).

## Code style: `const`

Something you may notice is that we almost always try to use `const`.
`const` should be the default when introducing a lexical variable
(that's to say use `const` instead of `let` and `var`).

You will very likely reach a point where you need to reassign a
lexical variable. Don't stress too much about it, give it a try
but if it's not practical then don't worry about using `let`,
it's ok.

A common hack that we use is an [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE)
if you have to, or just make local helper functions like so:

### Why we do this?

This improves the quality of code in numerous ways.
First of all, we don't have to check if a variable is null, undefined,
or some other default value because the variable is always initialized.
Second of all it signals that we cannot reassign anything half
way down the function body, and that takes off some mental load we'd
otherwise have to  worry about.
