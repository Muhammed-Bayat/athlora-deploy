---
sidebar_position: 3
---

# Sprint 4 Raw Meeting Transcript

This is the retained, date-bounded WhatsApp project-chat export for Sprint 4. It is chronological source evidence for the concise [Sprint 4 meeting records](./meeting-records). The archive includes messages from 28 September through 9 October 2026 only. Sensitive values, including credentials, tokens, database URLs, API keys, and access-bearing links, have been redacted.

## Attendees

- Aaliah Reddy
- Vareshan Rajah
- Vikram Mahalingam
- Muhammed Bayat
- Tyra Mohamed

## Chat Transcript

### 2026/09/29

**[10:06:35] Muhammed Bayat:** @⁨Vikram Mahalingam⁩ can you on the runner again please

**[10:06:46] Muhammed Bayat:** Some stuff were broken so the coverage reports weren’t showing

**[10:06:49] Muhammed Bayat:** So I’m tryna fix that

**[10:26:00] Vikram Mahalingam:** It should be on now

**[11:07:50] Muhammed Bayat:** Uhh

**[11:07:53] Muhammed Bayat:** They aren’t running still

**[11:07:55] Muhammed Bayat:** Any idea why

**[11:08:15] Vikram Mahalingam:** Lemme check it turns off randomly sometimes

**[11:08:59] Vikram Mahalingam:** They running now?

**[11:09:15] Muhammed Bayat:** Yea they  are

**[11:22:40] Vareshan Rajah:** We got this person as our tutor, don't know who that is😭 ‎&lt;attached: 00005181-PHOTO-2026-09-29-11-22-41.jpg&gt;

**[11:23:15] Vikram Mahalingam:** Isn’t that Nayan’s client?

**[11:23:57] Aaliah Reddy:** does he only have us or another group?

**[11:24:10] Vareshan Rajah:** Ya it is😭

**[11:24:25] Vareshan Rajah:** Nah it seems like he only has us ‎&lt;This message was edited&gt;

**[11:24:33] Aaliah Reddy:** yayy

**[15:28:27] Aaliah Reddy:** sprint 4<br />
<br />
- [ ] colour scheme <br />
- [ ] logo pictures <br />
- [ ] relay? test <br />
- [ ] performance <br />
- [ ] ui fixes: buttons on dashboard, pop up dialogs for event and athlete creation, and the UI tweaks <br />
- [ ] sign up works??<br />
- [ ] calendar glitch <br />
- [ ] API testing <br />
- [ ] athlete graphs some broken <br />
- [ ] offline logging can’t put like 10.5 only shows a comma <br />
- [ ] invited coach can create links<br />
- [ ] only coach can make their teams stuff official

**[17:06:28] Aaliah Reddy:** - [ ] delete buttons - are you sure & make red

**[17:22:06] Muhammed Bayat:** What do you guys think about the relay

**[17:22:10] Muhammed Bayat:** Keep or nah

**[17:57:26] Vareshan Rajah:** I think keep, I'm sure we can get it to work😭

**[18:44:16] Aaliah Reddy:** i was gonna make issues today, unless you wanna do them

**[18:48:39] Muhammed Bayat:** The issues like

**[18:48:47] Muhammed Bayat:** The agents mess up

**[18:48:51] Muhammed Bayat:** The issues

**[18:49:17] Muhammed Bayat:** So we can make the issues but then it must’ve have like instructions to

**[18:49:18] Muhammed Bayat:** Yk

**[18:49:42] Muhammed Bayat:** Coz the agent just does whatever n then we wnd up w customisations of dashboards n what not 😭😭

**[18:50:01] Muhammed Bayat:** So I think it’ll be better to manually just make the issues n implement it

**[19:08:45] Aaliah Reddy:** okay i can do it, but then when you do the issue you must just specify what to do and then tell it to do the relevant tests too

**[19:14:13] Aaliah Reddy:** i’m not gonna put the general UI stuff, if anyone has an idea on how to just make it looks a bit better and less condensed, maybe like using pop ups instead of scrolling or something then we can discuss it and maybe see what we can do

**[19:14:32] Aaliah Reddy:** the only actual backlog item is the logo upload

**[20:07:45] Aaliah Reddy:** okay so i created the issues

**[20:07:52] Aaliah Reddy:** my bad i didn’t get the picture thing that momo does

**[20:10:25] Aaliah Reddy:** okay so in sprint 4 backlog <br />
1. coach logo stuff, not too sure about the whole cover image thing whoever does it can feel free to remove it or do whatever feels right in regards to the logo stuff<br />
2. ⁠improve mobile usability, the mobile app is really not that great - pretty sure pooks said he will sort that one out because he knows what needs to be fixed<br />
3. ⁠i added the logic of the relay as a backlog item as well basically my logic was you have the team of 4, you calculate each persons 100m separately and then you sum them up to get the total time the relay was completed in - also whoever does this can just do what feels right to them and what makes the most sense <br />
<br />
when you do these issues just try to double check what the current process is like for the relay check how it works first and also for the mobile app as well ‎&lt;attached: 00005205-PHOTO-2026-09-29-20-10-26.jpg&gt;

**[20:14:56] Aaliah Reddy:** then there’s 8 issues in the bug tracker <br />
just make sure to read the issue and then go to the app and find the actual problem first before you apply the fix because the actual issue is vague and won’t necessarily fix the problem and also always ask it to make/remove the relevant tests when you do fixes or new functionality <br />
1. remove accent colour because it’s useless<br />
2. ⁠the athlete and event creation dialogs get cut off at the top, it needs to be infront of everything not behind the top bar where it gets cut off<br />
3. ⁠on mobile logging there’s no decimal points so that needs to change bc commas doesn’t work either <br />
4. ⁠invited coaches should be able to create public logging links for an event they’ve been added to<br />
5. ⁠restrict the official results to a coaches team, so a coach can only make their own athletes results official, not other athletes <br />
6. ⁠the calendar is tweaking a little it seems like when the day is selected it cuts off the event into like a little circle thing <br />
7. ⁠fix athlete personal graphs, it’s just not using the correct information to make the graph atm<br />
8. ⁠for the delete button by injury the delete button should be red to show it’s importance and to add a pop up with some sort of “Are you sure message”

**[20:16:16] Aaliah Reddy:** if you find any other problems just add it to the bug tracker and fix

**[20:16:34] Aaliah Reddy:** and then i didn’t add any of the other UI stuff, if anyone wants to tackle that feel free

**[20:33:02] Aaliah Reddy:** ‎You pinned a message

**[20:33:02] Aaliah Reddy:** ‎You pinned a message

**[20:21:35] Aaliah Reddy:** @⁨Vikram Mahalingam⁩ can you do the logo stuff<br />
@⁨Vareshan Rajah⁩ can you do the mobile UI <br />
and then i can do the relay stuff

**[20:22:44] Vikram Mahalingam:** Yup np @⁨Muhammed Bayat⁩ I just need the cloudflare API keys for the s3 bucket service

**[20:22:44] Vikram Mahalingam:** I can set it up after that

**[20:23:27] Muhammed Bayat:** Imma try to give you access to the cloud fare just lmk

**[20:23:45] Aaliah Reddy:** kk, i’ll get started tomorrow and then whoever isn’t busy with SDP needs to do CGV cause we have about 2 weeks until the beta version marking

**[20:25:04] Aaliah Reddy:** i’ll try do 1 or 2 fixes now and then the big stuff tomorrow

**[22:08:18] Aaliah Reddy:** i fixed the athlete graphs, calendar and the delete button

**[22:09:16] Aaliah Reddy:** i was struggling with the dialog box, my agent was tweaking out and kept changing it weirdly so i just deleted my branch and did a different fix

**[22:28:02] Aaliah Reddy:** found more problems <br />
RELAY: doesn’t allow you to start event bc there is no attending/not attending so it sees them all as pending <br />
<br />
also when assigning athletes to an event it says the athlete name and underneath “no squad assigned” that should not be there at all, squads don’t exist<br />
<br />
seasons? don’t know <br />
<br />
on calendar remove “Your events and accepted shared fixtures”<br />
<br />
for comparisons: athete vs across clubs, club stats, club vs club - be able to search for clubs

**[22:45:20] Vareshan Rajah:** Alrighty

### 2026/09/30

**[17:28:53] Vareshan Rajah:** Do we want to meet with Harshil tomorrow?

**[18:02:06] Aaliah Reddy:** yeah we can

**[18:03:00] Aaliah Reddy:** is anyone working on SDP later?

**[18:04:04] Vikram Mahalingam:** Yea but I’m just updating the docs

**[18:04:22] Aaliah Reddy:** you can also do that at the very end when we’re done with everything

**[18:04:32] Aaliah Reddy:** cause you’ll have to update it again then when we done with the issues

**[18:04:56] Vikram Mahalingam:** Yea but it’s super outdated so might as well catch it up a bit now💀 ‎&lt;This message was edited&gt;

**[18:05:21] Aaliah Reddy:** okay then i’ll continue with the other stuff tomorrow

**[19:38:39] Vikram Mahalingam:** I hit my usage limit so only some of the docs are updated

**[19:38:43] Vikram Mahalingam:** I’ll update and check at the end of the sprint

**[20:50:36] Aaliah Reddy:** guys question, do you think we have too many disciplines 😭<br />
like what is steeplechase

**[20:59:44] Muhammed Bayat:** 😭😭😭😭

**[21:03:35] Aaliah Reddy:** yeah some of them idkkkk😭😭

**[21:14:09] Aaliah Reddy:** i’m afraid to remove them cause i’m sure it’s gonna break stuff 😭😭

**[21:14:30] Aaliah Reddy:** i think this selection would be better

**[21:14:32] Aaliah Reddy:** ‎&lt;attached: 00005236-PHOTO-2026-09-30-21-14-33.jpg&gt;

**[21:17:32] Vikram Mahalingam:** It should be fine since we don’t have records for the obscure disciplines

**[21:19:19] Vareshan Rajah:** Okay Harshil said we can meet him at 1 tomorrow

**[21:28:58] Aaliah Reddy:** @⁨Muhammed Bayat⁩ when you can pls do 313 and 314, i’m not sure i know how the inviting stuff works😭 ‎&lt;attached: 00005239-PHOTO-2026-09-30-21-28-59.jpg&gt;

**[21:31:18] Muhammed Bayat:** Bro invited coaches are supposed to be able to get the link idk why they couldn’t then😭

**[21:31:55] Aaliah Reddy:** just check it out and see

**[21:32:01] Aaliah Reddy:** also can i remove squads entirely?

**[21:32:06] Aaliah Reddy:** we don’t use them at all right?

**[21:33:50] Muhammed Bayat:** Yup

### 2026/10/03

**[12:47:26] Aaliah Reddy:** hello friends

**[12:47:50] Aaliah Reddy:** i’m still doing a bunch of fixes for SDP, will let yall know when i’m done then we can just finish up and try to test everything and see if there’s anything else that needs fixing

**[12:48:18] Aaliah Reddy:** also not too sure yet on how to improve the performance, if anyone can maybe ask their agent for a plan on how we would improve it and then send it to me lmk

**[12:50:10] Aaliah Reddy:** @⁨Vareshan Rajah⁩ if you don’t wanna do the mobile UI stuff maybe you can see what’s wrong with it and make issues for it and put it in the bug tracker and then i can fix

**[12:50:55] Vareshan Rajah:** Hmm I will try start once I get home

**[12:51:36] Vareshan Rajah:** I'll have to give it to my agent coz I don't know what causes that screen shift

**[12:52:05] Aaliah Reddy:** okay that’s fine too, i’m just trying to get all of this stuff done so i’m gonna be working constantly

**[12:52:36] Vareshan Rajah:** Ohh damn😭

**[12:52:49] Aaliah Reddy:** i’ve been doing this since tuesday😭😭😭

**[12:52:56] Aaliah Reddy:** i’m winning though

**[12:53:26] Vareshan Rajah:** Ya that's outrageous😭😭

**[12:53:32] Vareshan Rajah:** Okay atleast

**[12:53:51] Aaliah Reddy:** yeah but it’s fine, cause yall can then push CGV

**[12:54:06] Aaliah Reddy:** i’m sure i’ll be done with this app early this week then we can push CGV

**[12:54:26] Vareshan Rajah:** Ya I'm gonna try get that train finished for Vik by tonight

**[16:23:40] Aaliah Reddy:** i’m not gonna be working on the app for a bit now cause i’m not gonna be home, there’s only 2 backlog items left in the sprint 4 kanban, the mobile UI and the logo stuff if anyone wants to do those

**[16:28:07] Muhammed Bayat:** I’ll do the logo stuff but I have family over so I’ll do it Tom

**[16:31:25] Aaliah Reddy:** yeah no stress

### 2026/10/04

**[10:48:21] Muhammed Bayat:** [REDACTED: credential-bearing message removed]

**[10:53:05] Aaliah Reddy:** did you do the logo stuff?

**[10:53:17] Muhammed Bayat:** Imma test it now

**[10:53:24] Aaliah Reddy:** noice

**[10:53:47] Aaliah Reddy:** i think i can get all the fixes done today then we can test the app throughout the week and make sure everything is good

**[11:16:02] Muhammed Bayat:** Does the ai say it can’t do something if you ask it something it can’t do @⁨Vareshan Rajah⁩

**[11:46:20] Muhammed Bayat:** whats the differemce between logo and cover image

**[11:46:53] Vikram Mahalingam:** Its the same thing I'm pretty sure

**[11:53:12] Aaliah Reddy:** take out the cover image part

**[11:55:14] Muhammed Bayat:** Yea I am

**[12:03:52] Muhammed Bayat:** Does the invite via email work

**[12:04:27] Aaliah Reddy:** nah idk why it’s still there tbh

**[12:04:33] Aaliah Reddy:** i asked the last time what it was for

**[12:04:38] Aaliah Reddy:** like on the account tab?

**[12:04:43] Muhammed Bayat:** Yes

**[12:04:48] Muhammed Bayat:** Okay I’ll remove it as well

**[12:04:56] Aaliah Reddy:** i don’t think it works, but also it’s not needed anyway

**[12:04:59] Aaliah Reddy:** kk thank you

**[12:05:38] Aaliah Reddy:** also i asked chat how the seasons should work and it said rather have like a coach can create their own seasons and stuff, ill figure out the logic of it later though

**[12:06:30] Muhammed Bayat:** Ookayy

**[12:31:35] Muhammed Bayat:** removed the cover image<br />
removed the invite by email andd link<br />
made sure only coaches can change the rolls of assistants

**[17:27:47] Vareshan Rajah:** Yes😭

**[20:15:14] Aaliah Reddy:** i just keep finding more problems

**[20:15:16] Aaliah Reddy:** ‎sticker omitted

**[20:15:47] Muhammed Bayat:** 😭😭😭how fr

**[20:16:20] Aaliah Reddy:** dude in like the athletes performance tab none of the competition and training data was updating 😭 and the PB’s weren’t updating properly either 😭

**[20:16:45] Aaliah Reddy:** and like none of the stats stuff included anything about the relays, so relay data just showed up blank everywhere

**[20:18:47] Muhammed Bayat:** But howww😭😭

**[20:19:02] Muhammed Bayat:** Swear it was working for the sprint ??

**[20:19:34] Aaliah Reddy:** so Bea’s PB is 8 right ‎&lt;attached: 00005292-PHOTO-2026-10-04-20-19-35.jpg&gt;

**[20:19:34] Aaliah Reddy:** SIKE ‎&lt;attached: 00005293-PHOTO-2026-10-04-20-19-35.jpg&gt;

**[20:19:42] Aaliah Reddy:** i really don’t think so lol

**[20:19:52] Muhammed Bayat:** Lmaooo 😭😭

**[20:20:03] Aaliah Reddy:** even like the live logger, events from september are still showing there to start the event 😭

**[20:20:13] Muhammed Bayat:** Aiaiaiai 💀

**[20:20:19] Aaliah Reddy:** you

**[20:20:23] Aaliah Reddy:** yoh

**[20:20:28] Aaliah Reddy:** i exceeded my free usage

**[20:20:29] Aaliah Reddy:** pls

**[20:20:37] Aaliah Reddy:** i will have to continue on another day😭😭😭

**[20:24:14] Muhammed Bayat:** Ightt let us know if you need help

**[20:24:43] Aaliah Reddy:** 1. In an athletes performance tab the PB's and SB's aren't showing correctly. For track events they should show as the fastest time recorded in all competitons of that discipline and for field events it should be the highest height/length in all competitions of that discipline. The PB's should match everywhere (on the dashboard roster, in the athlete performance tab, in the comparisons tab, on the public stats page, leaderboard and results).<br />
2. The progression charts should only contain results from completed competitions only.<br />
3. In the "Performance log" in the athletes performance tab doesnt seem to be updating for competitions/training. All completed competition/training events should update here correctly.<br />
4. In the "Performance log" remove the "Personal best (PB)" and "Season best (SB)" tags because they are unnecessary<br />
5. The "Performance log" table structure does not make sense, it should show the date of the meet, the event name with the competition or training, only final results after events have been completed should be visible (no non-scoring results) and the right hand column with the "Counts towards statistics" can be removed completely. So the layout of the table should be<br />
column 1: date<br />
column 2: event<br />
column 3: type (either competition or training)<br />
column 4: result<br />
Can rather make the recent results table a more compact table with these headings. So remove all tags. <br />
6. Only events on the day and in the future should appear in the live logger.<br />
7. ⁠If an events date has passed and it's tag is still scheduled change the tag to overdue <br />
Please plan these fixes along with the necessary tests

**[20:24:59] Aaliah Reddy:** Sorry since my credits ran out I needed to paste my prompt somewhere lol

**[20:25:18] Muhammed Bayat:** Dude swear don’t paste this whole thing in

**[20:25:22] Aaliah Reddy:** I'm using Mimo even though it takes gang long, it works really well

**[20:25:24] Muhammed Bayat:** Like paste one issue at a time

**[20:25:29] Muhammed Bayat:** Coz it messed it up

**[20:25:39] Muhammed Bayat:** Unless urs isn’t

**[20:25:39] Aaliah Reddy:** Nah trust i’ve been doing this and its working better cause Mimo takes so long

**[20:25:41] Muhammed Bayat:** 😭😭

**[20:25:51] Aaliah Reddy:** yeah mine is eating this stuff up icl

**[20:25:55] Muhammed Bayat:** To each their own 😭😭😭

**[20:26:17] Aaliah Reddy:** since my credits are up imma see if i can use my chat and fix all the performance issues

**[20:26:49] Aaliah Reddy:** icl some of the logic of this app isnt making sense😭😭😭

**[20:27:05] Aaliah Reddy:** i thought i'd be done with all the fixes today but it doesn't seem likely

**[21:00:11] Aaliah Reddy:** okay so i’m almost done with all the fixes, between today and wednesday can yall maybe play around with the app and take notes of things that take long to load or aren’t working correctly and send it to me, i might only be able to continue fixing on tuesday/wednesday💔

**[21:02:50] Aaliah Reddy:** @⁨Vareshan Rajah⁩ you can work on the mobile stuff when you’re free too

**[21:07:07] Vareshan Rajah:** Will do

**[21:23:12] Aaliah Reddy:** [REDACTED: credential-bearing message removed]

**[21:23:44] Aaliah Reddy:** If anyone would like to do this feel free, I tried to do it with chat but chat likes to break things so imma just wait for my mimo credits to come back

**[21:25:28] Vikram Mahalingam:** Can I do 1 and 2 or do I have to do the whole thing cause I used a lot of usage on CGV so I don’t think it’ll last😭

**[21:31:08] Aaliah Reddy:** honestly im so stupid, something was tweaking with the app and i thought chat broke something so i deleted the entire branch with the performnce fixes so we have to start them again

**[21:31:41] Aaliah Reddy:** rather leave it then, I will do it when i can

**[21:32:25] Vikram Mahalingam:** Nah it’s fine I’ll see how far I can get if it works I’ll push and you can continue

**[21:33:21] Aaliah Reddy:** the thing is it’s like steps on how to improve the performance so like i’d rather just do it all together and test and make sure it works properly

**[21:33:35] Aaliah Reddy:** you can do this though?😭

**[21:34:07] Vikram Mahalingam:** Ok I’ll start on that

**[21:34:30] Aaliah Reddy:** okay, if you go the athletes performance tab you’ll see what i’m talking about in the messages

**[21:35:01] Aaliah Reddy:** let me know how far you get🙏<br />
and i can continue after

### 2026/10/05

**[00:38:03] Vikram Mahalingam:** I’ve been going for like 3 hours and it broke everything so I didn’t push😭😭😭😭

**[00:38:25] Vikram Mahalingam:** The pb/sb is apparently quite a deep problem

**[00:38:58] Vikram Mahalingam:** I’ll do a bunch of the easier ones tomorrow

**[05:12:39] Muhammed Bayat:** 💀💀💀

**[16:50:13] Aaliah Reddy:** i’m trying to do this now lol

**[20:00:59] Aaliah Reddy:** ‎sticker omitted

**[20:01:09] Aaliah Reddy:** how i’ve been for the past 3 hours waiting 😭💔

**[20:01:35] Vikram Mahalingam:** I told you bro that pb is deep😭😭😭

**[20:01:53] Aaliah Reddy:** i fixed the PB/SB stuff

**[20:02:02] Aaliah Reddy:** it’s just mainly layout stuff now and the progression charts

**[20:02:25] Vikram Mahalingam:** Lmk when you’re done I’ll try take over what’s left

**[20:02:44] Aaliah Reddy:** im honestly waiting for it to do all the fixes, i left out the live logger stuff for now

**[20:02:55] Vikram Mahalingam:** Ok cool

**[20:03:11] Aaliah Reddy:** so don’t stress about it now, i’m probably gonna need a bit of help on wednesday or thursday

**[20:03:42] Aaliah Reddy:** i’m still trying to figure out how the season stuff should work cause being able to add your own seasons will make me have to change a whole lot of stuff 🫠

**[20:04:20] Vikram Mahalingam:** Don’t you want to just have fixed seasons one per year?

**[20:04:28] Aaliah Reddy:** yeah i think im gonna keep it like that

**[20:04:30] Vikram Mahalingam:** Why do we need custom seasons?

**[20:04:55] Aaliah Reddy:** so momo said to just leave it

**[20:05:08] Vikram Mahalingam:** Yea mize

**[20:05:13] Aaliah Reddy:** 😭😭😭😭😭

**[20:05:31] Aaliah Reddy:** still have to do the sprint docs but that should be quick anyway

**[20:06:02] Vikram Mahalingam:** Yea isn’t the sprint only done next Friday tho?

**[20:06:05] Aaliah Reddy:** and the performance stuff 🫠

**[20:06:09] Aaliah Reddy:** nope this sunday

**[20:06:17] Vikram Mahalingam:** Oh *** I see

**[20:06:20] Aaliah Reddy:** hand in is on the 11th

**[20:06:29] Aaliah Reddy:** that’s why i’ve been trying to graft this thing 😭😭

**[20:06:43] Aaliah Reddy:** cause then we also have to start preparing for our presentation

**[20:07:01] Muhammed Bayat:** I’ll do the ppt for us

**[20:07:01] Vikram Mahalingam:** That shouldn’t be too bad tho

**[20:07:18] Vikram Mahalingam:** Yea ask Claude to cook like for novacare

**[20:07:22] Aaliah Reddy:** we should do like a skit

**[20:07:36] Aaliah Reddy:** “are you a coach that keeps losing their result sheets”

**[20:07:40] Aaliah Reddy:** we have just the thing for you

**[20:07:49] Muhammed Bayat:** 💀💀💀

### 2026/10/06

**[12:31:52] Aaliah Reddy:** I HAVE SURVIVED THIS🙏

**[12:32:04] Aaliah Reddy:** just need to do fixes 6 and 7

**[12:32:22] Aaliah Reddy:** and then the performance and all should be done🫠

**[12:32:57] Aaliah Reddy:** @⁨Vareshan Rajah⁩ pls don’t forget about the mobile UI lol

### 2026/10/07

**[12:28:19] Aaliah Reddy:** i’m almost done guys

**[12:28:27] Aaliah Reddy:** i found a few more issues but i’m fixing them now

**[12:29:01] Aaliah Reddy:** i’ll do the performance and docs either later or tomorrow then all should be well, then vik can fix the docs and we don’t need user stories for this sprint cause it was just fixing stuff

**[12:29:39] Vareshan Rajah:** I'm gonna start on the mobile UI after tutoring

**[12:33:02] Aaliah Reddy:** kk, i’m not sure how long my agent is gonna take cause im doing the issues in sections so im gonna be pushing continuously so just lmk if you push and ill ask let you know so you know when to pull

**[12:33:38] Vareshan Rajah:** Ohh okay

**[14:31:13] Aaliah Reddy:** gitea is tweaking again and not letting me merge 🫠

**[16:34:22] Aaliah Reddy:** @⁨Vareshan Rajah⁩ i’ve done all the fixes but because of this gitea issue it won’t be deployed and merged yet, it’s only all merged locally on my laptop

**[16:41:25] Vareshan Rajah:** Okay I'll wait for that

**[16:42:03] Aaliah Reddy:** hopefully it’ll be back later and then i can check that everything merged properly

**[16:42:13] Vareshan Rajah:** Hopefully😭

**[16:42:27] Aaliah Reddy:** i wanted to be done by tomorrow

**[16:43:14] Vareshan Rajah:** He will probably fix it soon hopefully😭

**[16:43:26] Aaliah Reddy:** shayna said her group emailed him

**[18:01:59] Aaliah Reddy:** it’s fixed

**[18:02:06] Aaliah Reddy:** all my changes are on the deployed app now

**[18:03:03] Aaliah Reddy:** i found one small issue if you can fix if you can’t it’s okay i’ll do it when i get back home<br />
on the stats from the landing the select a published club just needs to be scrollable

**[18:04:38] Aaliah Reddy:** i’m 99% sure i’ve fixed everything lol, will do the performance stuff tomorrow then you guys can check it out

**[18:18:30] Muhammed Bayat:** ‎sticker omitted

**[18:18:34] Muhammed Bayat:** ‎sticker omitted

**[18:53:33] Vareshan Rajah:** Okay I'm gonna start with the mobile UI now now

**[22:05:26] Aaliah Reddy:** lmk if you manage to finish

**[22:23:14] Vareshan Rajah:** It's busy on it still

**[23:06:47] Vareshan Rajah:** Okay so some of the mobile issues were fixed

**[23:06:56] Vareshan Rajah:** But I had to push to test

**[23:07:18] Vareshan Rajah:** I hit my time usage so I'll continue when it comes back

### 2026/10/08

**[08:18:02] Aaliah Reddy:** you can also just make it half screen to test on your laptop

**[10:00:10] Vareshan Rajah:** Would that work

**[10:17:40] Aaliah Reddy:** yeah when up make it half screen it switches to mobile layout

**[10:25:44] Vareshan Rajah:** Ohh *** I didn't know that😭

**[10:26:09] Aaliah Reddy:** computer scientist fr🤣🤣🤣

**[10:27:14] Vareshan Rajah:** 🤣🤣

**[10:27:47] Aaliah Reddy:** i’m gonna do the last fix when i get home and then the performance stuff

**[10:32:39] Vareshan Rajah:** Ohh okay

**[10:33:04] Aaliah Reddy:** i’ll let you know if i push before you

**[10:33:14] Vareshan Rajah:** I also just need to fix the ai thing

**[10:33:18] Vareshan Rajah:** Alrighty

**[10:34:52] Aaliah Reddy:** we’re almost at the end of the road 😭

**[10:35:36] Vareshan Rajah:** It's crazy icl😭

**[10:36:41] Aaliah Reddy:** this app has finished me

**[10:36:43] Aaliah Reddy:** i can’t wait to be done

**[10:36:57] Aaliah Reddy:** let me know if you find any problems while you’re testing as well

**[10:38:15] Vareshan Rajah:** I can imagine

**[10:38:30] Vareshan Rajah:** Alrighty

**[13:10:02] Aaliah Reddy:** i pushed again pooks

**[13:10:07] Aaliah Reddy:** idk what’s going on with deployment though

**[13:12:31] Vareshan Rajah:** I pushed about an hour ago and it was fine😭

**[13:12:51] Aaliah Reddy:** my agent was picking up something and my recent changes aren’t deployed

**[13:13:02] Vareshan Rajah:** The mobile UI is completely fixed

**[13:13:24] Vareshan Rajah:** The only thing that my agent was still busy with was fixing the ai but that hasn't been pushed yet

**[13:13:41] Vareshan Rajah:** I'll finish that once I get my limit back😭

**[13:13:47] Vareshan Rajah:** Ohh ***, okay I'll check

**[13:16:52] Vareshan Rajah:** It all looks fine

**[13:17:01] Vareshan Rajah:** Like it says it's deployed

**[13:17:14] Aaliah Reddy:** yeah but my changes aren’t on the deployed site

**[13:18:08] Vareshan Rajah:** Are you sure, cause it's all merged properly

**[13:18:15] Vareshan Rajah:** What were your changes?

**[13:18:17] Aaliah Reddy:** okay it seems fine now

**[13:18:39] Vareshan Rajah:** Ohh okay

**[13:21:55] Aaliah Reddy:** pooks also pls check the weather stuff idk what happened there

**[13:23:47] Vareshan Rajah:** On the mobile UI?

**[13:25:33] Vareshan Rajah:** I know on the mobile I just need to fix the spacing

**[13:55:57] Aaliah Reddy:** no like make sure it working fine

**[13:56:37] Vareshan Rajah:** Ya I tested it and it seemed fine

**[14:17:36] Vareshan Rajah:** 100% for sprint 3 guys😝

**[14:17:49] Aaliah Reddy:** GG’s

**[14:29:53] Vikram Mahalingam:** I added rate limiting to the API, auth and AI

**[14:29:53] Vikram Mahalingam:** It’s 600 for the API, 60 for auth and 45 for AI tokens every 15 minutes

**[14:30:05] Vikram Mahalingam:** If that seems like too little lmk I’ll increase it

**[14:30:24] Vikram Mahalingam:** It should be more than enough for regular use tho

**[14:32:11] Aaliah Reddy:** now what does that mean😭

**[14:32:31] Vikram Mahalingam:** The number of requests you can make in 15 minutes

**[14:32:42] Vikram Mahalingam:** Just security measures to prevent abuse

**[14:33:18] Vareshan Rajah:** Ohh *** well I did change the AI model, well I'm busy with that so I switched to 3.8 Live Extended something something

**[14:33:51] Vareshan Rajah:** But the limits stuff should be fine if it causes any issues I'll just let you know

**[14:33:55] Aaliah Reddy:** my agent is busy just doing the performance stuff too rn but i’ll only be able to check it later cause im not gonna be home

**[14:34:22] Vikram Mahalingam:** Yea np

**[14:34:39] Vikram Mahalingam:** Yes my stuff shouldn’t affect anything on your side

**[14:34:54] Vikram Mahalingam:** Just pull before you push in case it does

**[14:35:20] Aaliah Reddy:** yeah i will

**[14:40:54] Muhammed Bayat:** Oh *** 😼

**[14:41:35] Muhammed Bayat:** Is ur agent liek busy running at home

**[14:41:38] Aaliah Reddy:** i’ll try push the performance stuff by tonight so someone can play with the app and lmk how it is

**[14:41:45] Aaliah Reddy:** i’m still at home lol

**[14:42:17] Aaliah Reddy:** i’m just waiting for it to finish build then imma test but idk if it’ll finish by the time i need to leave so i’ll let it build and test when i get back

**[17:51:30] Vareshan Rajah:** Okay I also pushed some stuff

### 2026/10/09

**[11:20:08] Muhammed Bayat:** @⁨Vikram Mahalingam⁩ are docs fully updated / reworked or can I work on them

**[11:20:27] Aaliah Reddy:** don’t work on them just yet

**[11:20:38] Aaliah Reddy:** cause i’m still busy fixing and it’s probably gonna update the docs

**[11:20:48] Vikram Mahalingam:** They were up to date up to last sprint

**[11:20:53] Aaliah Reddy:** i’m almost done though, just 2 small fixes and some more performance stuff

**[11:20:56] Muhammed Bayat:** Alright lmk when

**[11:21:00] Aaliah Reddy:** kk

**[11:21:06] Muhammed Bayat:** Nah they weren’t 😭😭

**[11:21:18] Vikram Mahalingam:** Yea I fixed them after

**[11:21:25] Muhammed Bayat:** Oh awes

**[11:21:27] Aaliah Reddy:** you can also give me the prompt if you want

**[13:15:50] Aaliah Reddy:** Okay so i have finished everything, please someone check it out for me<br />
The only thing with performance I couldn't seem to get better was like the making results official, recording and finalising sessions, if anyone wants to tackle that feel free but I’m not sure if that can even be better <br />
All bugs should be fixes and everything should make sense<br />
If anyone has time to do like a showcase just to make sure everything is good and ready to go please do that<br />
I'm not sure if you guys want to like remove some unnecessary data but if you want then cool<br />
I'm just gonna do the sprint 4 docs now quick and then all should be done and Momo can work on the docs
