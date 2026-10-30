Output docs/demo.gif

Require bash
Require node

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 650
Set Padding 20
Set TypingSpeed 40ms
Set Theme "TokyoNight"
Set WindowBar Colorful
Set WindowBarSize 36

# scripts/demo-setup.sh builds the whole mock tree (a task in progress, one
# already done, a pending decision, one waiting on someone) before the bench
# ever opens, so the recording is almost entirely the bench itself.
Hide
Type "source scripts/demo-setup.sh"
Enter
Sleep 5000ms
Show

Type "decs"
Enter
Sleep 2800ms

# Fold and unfold Ship v2.4's children.
Type "-"
Sleep 1000ms
Type "+"
Sleep 1000ms

Down
Sleep 700ms
Down
Sleep 1800ms

# Scroll the detail pane to read further into the pending decision's body.
Type "j"
Sleep 150ms
Type "j"
Sleep 150ms
Type "j"
Sleep 150ms
Type "j"
Sleep 150ms
Type "j"
Sleep 150ms
Type "j"
Sleep 150ms
Type "j"
Sleep 150ms
Type "j"
Sleep 2500ms

# Answer with a number — the node turns green.
Type "2"
Sleep 500ms
Enter
Sleep 2600ms

# Walk the other tabs: Active, the now-empty Decide, All (children folded
# into "Completed"), and Waiting — then back to Available.
Tab
Sleep 700ms
Tab
Sleep 900ms
Tab
Sleep 1700ms
Tab
Sleep 1700ms
Tab
Sleep 1000ms

Type "q"
Sleep 300ms

# An agent picking up the owner's answer — under two seconds of command line.
Type "decs read W4"
Enter
Sleep 900ms
