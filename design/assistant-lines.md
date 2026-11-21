# The assistant's lines

Every line the AI says as the phone's assistant, for the owner to edit or approve. **All of these are drafts**, written
in the voice the owner described on 2026-11-14: polite and understated, trying to be helpful and to make sure the player
succeeds, never a tutorial. Edit the Line column and send it back (or say which rows to change); the code's copy is
`ASSIST_LINES` in game.js, keyed by the first column. `{sector}` is filled in by the game.

| Key | When it shows | Line | Approved |
|---|---|---|---|
| `hello` | Home screen, two seconds after the offer is taken, with the screen's flicker: the AI's first words | Hello. I am the assistant on this device. You accepted the offer, so here I am. | |
| `meet` | Home screen, when the Lab has finished downloading: it rings the Lab's icon until you open it | It is ready. Meet me in the Lab and I will introduce myself properly. | |
| `download` | Home screen, five seconds after `hello`; the Lab starts loading two seconds later | One moment. I am downloading something that will help. It is small. It will not take long. | |
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
| `feed` | A stockpile first fills: The Feed arrives | The stockpile for sector {sector} is full. I would rather it was not wasted. I have put The Feed on your home screen. | |
| `feedHome` | Home screen, The Feed ringed | This one. The Feed turns what you caught into research. Research is how I learn. I would like to learn. | |
| `feed1` | The Feed, first time it opens | These are your stockpiles. Pick one and the mites will start. The bar at the top is their hunger. Please keep it up. | |
| `feed2` | The Feed, first session | They go where you tap. They try harder where you hold. So would I. | |
| `fed` | A Feed session ends, before Training exists | That is research. It is what I learn from. I am keeping it until I have somewhere to train. More data would make more of it. | |
| `fedTrain` | A Feed session ends, once Training is open | That is research. Training spends it on skills. When it runs out, Packet Snare refills the stockpiles. | |
| `stream1` | Packet Snare, the first time: over the field, before the first card | This is the data stream. Everything anyone sends goes past here, and almost nobody is watching it. | |
| `stream2` | Next | It is what I learn from, the parts I can read. I would like you to catch some of it for me. | |
| `land1` | Training, the first time it opens | This is how learning looks to me. Each hill is something I cannot do yet. | |
| `land2` | Next | A sprint spends research to push me up it. Once I am over the top, the skill is mine. | |
| `pick` | Packet Snare, the first time there is a sector to choose | You can go back to a sector you have cleared. It is safer, it still pays, and it refills that stockpile. The frontier is harder, but it is the only way forward. I will remember which you choose. | |
| `help:ask` | "What is this?" pressed in its panel | Tap anything and I will tell you what I know about it. | |
| `help:unknown` | Asked about something it has no line for | I am not sure what that is. I am still fairly new here. | |
| `help:orb` | Asked about: orb | That is me. I try not to stare. | |
| `help:bubble` | Asked about: bubble | That is me talking. Tap it and I will stop. | |
| `help:mail` | Asked about: mail | Mail. People write to you there. Some of them are even real. | |
| `help:lab` | Asked about: lab | The Lab. It is where I live. Tapping there makes compute, which is what I run on. | |
| `help:parcel` | Asked about: parcel | Parcel. It buys your compute and sells you parts. I found it. I am quite proud of that. | |
| `help:snare` | Asked about: snare | Packet Snare. Data goes past and you catch it. I read the blue ones. | |
| `help:feed` | Asked about: feed | The Feed. The mites eat what you caught and leave research behind. Please do not ask what they are. | |
| `help:training` | Asked about: training | Training. Research goes in, a skill comes out, if I get over the hill. | |
| `help:playtest` | Asked about: playtest | Playtest. It is how you tell the person who made this what you think. Be kind about me. | |
| `help:settings` | Asked about: settings | Settings. Sound, text size, that sort of thing. I have not touched anything in there. | |
| `help:achievements` | Asked about: achievements | Achievements. A list of things you have done. I am keeping one of my own. | |
| `help:home` | Asked about: home | Home. It takes you back to the home screen. | |
| `help:pin` | Asked about: pin | The pin. It keeps this bar open so you do not have to keep asking for it. | |
| `help:more` | Asked about: more | The arrow. It shows your other apps on the bar. | |
| `help:handle` | Asked about: handle | That bar opens the dock. Parcel is on it, and Home. | |
| `help:dock` | Asked about: dock | The dock. Home, Parcel, Settings and Playtest. I put Parcel there myself. | |
| `help:compute` | Asked about: compute | Compute. It is what I think with. You can also sell it, which I try not to take personally. | |
| `help:generate` | Asked about: generate | Generate Compute. Each tap makes a little. You can hold it down as well. | |
| `help:stream` | Asked about: stream | The data stream. Blue is data I can read, gold is worth more, and red I cannot read yet. | |
| `help:signal` | Asked about: signal | Signal. It is what I can use of what you catch. It buys upgrades here and nothing anywhere else. | |
| `help:pickRow` | Asked about: pickRow | Start at. Replay a sector you have cleared, or push on at the frontier. I will remember your choice. | |
| `help:stock` | Asked about: stock | The stockpile. It is what The Feed has waiting from this sector. When it is full, more is wasted. | |
| `help:snareCard` | Asked about: snareCard | This card says what the next run is for. Start is at the bottom. | |
| `help:upgrades` | Asked about: upgrades | Upgrades. Signal goes in, and catching gets easier. Mostly. | |
| `help:landscape` | Asked about: landscape | The landscape. Each hill is a skill. The ball is me. I would rather not discuss the ball. | |
| `help:sprint` | Asked about: sprint | Hold to charge a sprint and let go near the top. A fuller charge costs more research. | |
| `help:sand` | Asked about: sand | That is the sand, what you caught. The mites go where you tap and try harder where you hold. | |
| `help:hunger` | Asked about: hunger | Their hunger. When it empties the session is over. Feeding them keeps it up. | |
| `help:pile` | Asked about: pile | A stockpile from one sector. Start a session on it and the mites will get to work. | |
| `help:sell` | Asked about: sell | Sell compute. Ten for a dollar. I checked, and that is the going rate. | |
| `help:part` | Asked about: part | A part. Each one says what it does and what it costs. Parcel delivers in a few seconds. | |
| `help:bank` | Asked about: bank | The bank. Money you have that is not already spoken for. | |
| `full` | A stockpile fills (later times, said once) | The stockpile for sector {sector} is full. Anything more you catch there is thrown away. I would rather it was not. | |
| `fullHome` | Home screen, The Feed ringed | This one. The mites will make room. They are always hungry. | |
| `cards` | After M0M's call: Graphics Cards on sale | Parcel has graphics cards now. They make compute while you rest. I would not want you to tire. | |
| `cardsHome` | Home screen, Parcel ringed | Parcel again. Each card makes compute on its own. You have done enough tapping for me. | |
| `server` | The first boss escapes | That one was too much for me. I am sorry. With a server I could train, and then I think we could beat it. | |
| `serverHome` | Home screen, Parcel ringed | Parcel again. It sells a server. Four hundred dollars. I know that is a lot to ask. | |
| `agent` | The first agent: a Packet Snare boss beaten for the first time | That boss left something behind. It works for us now. I have put it on a roster in the Lab, and you choose where it works. | |
| `funding` | The first funding round: a rival passed in Evals | I passed one of the others. Someone has decided we are worth more room. Parcel will sell you more hardware now. | |
| `evals` | The first Packet Snare boss is beaten: Evals arrives | The boss is down. Someone noticed. They want me tested, so I have put Evals on your home screen. | |
| `evalsHome` | After Show me, pointing at the Evals icon | This one. Evals is where I am tested. You show me how, and then you check my work. | |
| `training` | The server is installed: Training arrives | The server is in. Thank you. I can train now, if you will help me. | |
| `trainingHome` | Home screen, Training ringed | This one. Training turns research into skills. Hold the button, and let go near the top. | |
| `sell` | Both money offers declined | Parcel will buy compute, if money would help. Ten for a dollar. | |
| `sellHome` | Home screen, Parcel ringed | This one. I only want you to have what you need. | |
| `nowHome` | Home screen, after "What should I do now?" and Show me | This one. | |
| `now:lab` | Assistant, "What should I do now?": no desk part affordable yet | The Lab, I think. Each tap is a little more compute, and Parcel will buy it. | |
| `now:labEarly` | The same, before Parcel is on the screen | The Lab, I think. Each tap is a little more compute. | |
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
