# Brief: verify a fix batch (a quick reviewer, about ten minutes)

You check that a batch of fixes landed and broke nothing. You don't score the game.

1. Read the fix list you're given, `known-issues.md` (its *fixed: verify* section), and the report's rule checks and
   still-region screenshot diffs against the last report.
2. For each fix: open the report's before and after screenshots, and where a screenshot can't show it, reproduce it in
   the frozen build with the kit (a few actions, not a playthrough). Say **holds**, **doesn't hold** or **can't tell**.
3. Look for regressions: any rule check that failed, any screenshot whose still parts changed where no fix was meant to
   change them, anything a fix touched that now looks or behaves wrong.

Your final message: a line per fix (holds / doesn't hold / can't tell, with the screenshot or steps), then regressions
(`[regression]`, how to reproduce), then anything else you noticed in passing (`[new]`), briefly.
