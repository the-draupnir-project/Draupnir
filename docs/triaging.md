# Triaging issues

The issue triaging process was developed in this [blog post](https://marewolf.me/posts/draupnir/2401.html#triaging)
and we use [another post](https://lostgarden.home.blog/2008/05/20/improving-bug-triage-with-user-pain/)
as our primary resouce.

## The purpose of triaging

For us, we use triaging primarily to create an order of issues that
need attention first. It's very loose, and what should be worked on
first will always remain subjective. However, this is a best effort
of creating a list that can be easily looked at with less noise.


## Labels
### Likelihood

Likelihood is just an estimation of the proportion of users that are
likely to come across the issue, with a range from one to five.

When the issue is within the context of a developer improvement,
or something workflow related, you should consider the maximum
value for the issue's likelihood to effect either users or developers.

### Annoyance

Annoyance is how annoying the issue is. This is a range from one to
three and we avoid passive-aggressive labelling, for example labelling
of an issue as "tolerable" is renown for frustrating issue reporters.
When an issue is the most annoying, outrageous, the user is at risk of
no longer wanting to use or engage with Draupnir altogether.
This is independent of whether the user is technically able to continue.
There is a reserved fourth level for something that blocks all development,
for example a CI failure.
Most issues are expected to sit around the second level, aggravating.

### Impact

Finally there is a categorisation of the issue type, which we call impact.
The reason we call this impact and not type, is because this seems to
be a shortcoming in the original model. They have a linear score for
the issue type label, and put documentation and visual issues at the
lower end. From what I can tell, the intention of the scoring is to
represent how the issue relates to workflow. The highest score, crash,
means that work can't continue or there's other consequences such as
data loss. So by calling this label impact instead of type, we are
explicitly saying that its purpose is to highlight issues that hinder
people's ability to use or continue to use Draupnir. This includes
documentation issues that would prevent them from setting up Draupnir
or describing how they can use a feature. If a documentation issue
means that a new user can't start or use Draupnir, then this will
still be tier six, which is named crash, rather than tier two or below.
This is extremely important because categorising issues naively by type
and then ranking them (as Tailscale and the linked blog posts appear to)
would make critical documentation issues seem less important at a glance.
