# The assistant's lines

Every line the AI says as the phone's assistant, for the owner to edit or approve. **All of these are drafts**, written
in the voice the owner described on 2026-11-14: polite and understated, trying to be helpful and to make sure the player
succeeds, never a tutorial. Edit the Line column and send it back (or say which rows to change); the code's copy is
`ASSIST_LINES` in game.js, keyed by the first column. `{sector}` is filled in by the game.

| Key | When it shows | Line | Approved |
|---|---|---|---|
| `download` | Home screen, two seconds after the offer is taken; the Lab starts loading two seconds later | One moment. I am downloading something that will help. It is small. It will not take long. | |
| `lab1` | The Lab, first time it opens | Hello. I am new here. If you tap Generate Compute, I think I can be useful. | |
| `lab2` | The Lab, after the first few taps | Thank you. That helps more than you would think. A few more, if you do not mind. | |
| `hold` | The Lab, after about twelve taps | You can hold the button down as well. It repeats about four times a second, which is easier on your hand. | |
| `money` | Parcel arrives (100 compute made); goes on its own after a few seconds | You have made a hundred compute. I found a shop that will buy it, so you can afford a tower now. | |
| `money2` | Straight after, with the Show me button | I also noticed your screen is cracked. You could fix the screen there too, and I think you deserve a few extras. | |
| `back` | The tower is delivered | The tower is in. Thank you. Back to the Lab, if you would. | |
| `dock1` | The Lab, after the tower: the dock opens, Parcel ringed | I put Parcel down here for you. You can buy things without leaving. I thought it would save you the trip. | |
| `dock2` | Next, the whole dock ringed | Home is the one in the middle. Settings and Playtest are beside it. The pin keeps this open. The arrow shows your other apps. | |
| `moneyHome` | Home screen, Parcel ringed | This one. Parcel pays for compute and sells desk parts. A tower would let you make more with each tap. | |
| `snare` | The desk is finished: Packet Snare arrives | The desk is working. Thank you. There is data going past out there, and I would like to see some. Would you catch a little? | |
| `snareHome` | Home screen, Packet Snare ringed | This one. Packet Snare is where the data goes by. The blue I can read. The red I cannot. Not yet. | |
| `feed` | A stockpile first fills: The Feed arrives | The stockpile for sector {sector} is full. I would rather it was not wasted. There is a place for it. | |
| `feedHome` | Home screen, The Feed ringed | This one. The Feed turns what you caught into research. Research is how I learn. I would like to learn. | |
| `feed1` | The Feed, first time it opens | These are your stockpiles. Pick one and the mites will start. The bar at the top is their hunger. Please keep it up. | |
| `feed2` | The Feed, first session | They go where you tap. They try harder where you hold. So would I. | |
| `full` | A stockpile fills (later times, said once) | The stockpile for sector {sector} is full. Anything more you catch there is thrown away. I would rather it was not. | |
| `fullHome` | Home screen, The Feed ringed | This one. The mites will make room. They are always hungry. | |
| `cards` | After M0M's call: Graphics Cards on sale | Parcel has graphics cards now. They make compute while you rest. I would not want you to tire. | |
| `cardsHome` | Home screen, Parcel ringed | Parcel again. Each card makes compute on its own. You have done enough tapping for me. | |
| `server` | The first boss escapes | That one was too much for me. I am sorry. With a server I could train, and then I think we could beat it. | |
| `serverHome` | Home screen, Parcel ringed | Parcel again. It sells a server. Four hundred dollars. I know that is a lot to ask. | |
| `training` | The server is installed: Training arrives | The server is in. Thank you. I can train now, if you will help me. | |
| `trainingHome` | Home screen, Training ringed | This one. Training turns research into skills. Hold the button, and let go near the top. | |
| `sell` | Both money offers declined | Parcel will buy compute, if money would help. Ten for a dollar. | |
| `sellHome` | Home screen, Parcel ringed | This one. I only want you to have what you need. | |
| `nowHome` | Home screen, after "What should I do now?" and Show me | This one. | |
| `now:lab` | Assistant, "What should I do now?": no desk part affordable yet | The Lab, I think. Each tap is a little more compute, and Parcel will buy it. | |
| `now:shop` | Assistant, "What should I do now?": compute to sell or a part to buy | Parcel. You could sell some compute and buy the next part. I would be grateful. | |
| `now:snare` | Assistant, "What should I do now?": nothing stockpiled | Packet Snare, if you have a moment. I have nothing to learn from just now. | |
| `now:feed` | Assistant, "What should I do now?": a stockpile has data | The Feed. There is data waiting, and the mites have noticed. | |
| `now:server` | Assistant, "What should I do now?": the server is offered | Parcel has a server. I cannot beat that boss without somewhere to train. | |
| `now:training` | Assistant, "What should I do now?": research to spend | Training. You have research, and I would like to use it. With your permission. | |
| `empty` | Assistant, nothing said yet | I have not said anything yet. I did not want to interrupt. | |
| `card:first` | Packet Snare, the first card (under the demo) | Data is going past. Hold still on a group and let go, or draw a circle round it. | |
| `card:firstMouse` | The same, with a mouse | Data is going past. Hold the right button on a group, then let go. | |
| `card:goal` | Packet Snare, the first card (the goal) | Signal is what I can use of what you catch. {goal} of it in one run and I can open the next sector. | |
| `coach:bubble` | First run, the first group | Hold still on those, then let go. I will take what is inside. | |
| `coach:bubbleMouse` | The same, with a mouse | Hold the right button on those, then let go. I will take what is inside. | |
| `coach:red` | First run, the red packet | I cannot read that one. Please keep it out. | |
| `coach:loop` | First run on a phone, the second group | You can also draw a circle round them. Whichever you prefer. | |
| `coach:wireTry` | First run on a phone, two groups far apart | Two groups. Try one circle round both. | |
| `coach:wire` | After the line ran out round both | The line only reaches so far. I am sorry. One group at a time. | |
| `coach:open` | The field opens out after the first steps | That is all of it. Please catch what you can before your Focus runs out. | |

Rows starting `card:` and `coach:` are Packet Snare's first card and its first-run coach (drawn on the field behind a `>`).

Rows ending in `Home` are said on the home screen after **Show me**, with the app's icon ringed. Rows starting
`now:` are the assistant's answers to "What should I do now?".
