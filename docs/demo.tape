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

Hide
Type "source scripts/demo-setup.sh"
Enter
Sleep 500ms
Show

Type `decs add "Add dark mode" --task --author "Alice · theming"`
Enter
Sleep 700ms

Type `decs start W1`
Enter
Sleep 600ms

Type `./build.sh | decs progress --node W1 --parse percent`
Enter
Sleep 2300ms

Type `decs add "Pick signup CDN" --task --author "Bob · infra"`
Enter
Sleep 700ms

Type `decs ask W2 --author "Bob · infra" -o 1="Keep current CDN" 2="Switch to edge provider" --default 1`
Enter
Sleep 900ms

Type "decs"
Enter
Sleep 1300ms

Down
Sleep 500ms

Type "2"
Sleep 600ms

Enter
Sleep 1500ms

Sleep 1000ms

Type "q"
Sleep 500ms
