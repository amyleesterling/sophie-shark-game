# 🐠 Sophie's Shark & Fish Game 🦈

A 3D underwater adventure **designed by Sophie (age 6, almost 7!)** 💛

**▶️ Play it here: https://amyleesterling.github.io/sophie-shark-game/**
(works on computers, phones, and tablets)

## How to play

You are a little fish in an **endless ocean** — swim in any direction and
the reef goes on forever. Collect **4 gems 💎** to earn the crown and level
up, then keep going: every level brings more sharks, faster sharks, and 4
fresh gems. Sparkle dots always point the way to the next one.

Watch out for the **sharks**! If they see you, they'll chase you.
**Hide behind the coral 🪸** and they can't see you at all.

You have **4 lives ❤️❤️❤️❤️**.

### Gem powers (Sophie's rules!)

| Gem | Power |
|-----|-------|
| 💎 1st gem | You get to swim **super fast** ⚡ |
| 💎 2nd gem | A **sea-dragon king** 🐉 swims across the screen and scares the sharks away for **10 seconds**! |
| 💎 3rd gem | You leave a **sparkle trail** ✨ |
| 💎 4th gem | A **treasure chest** appears — open it for the **royal crown** and LEVEL UP! 👑 |

**Levels:** every crown levels you up on the spot — more sharks, faster
sharks, and 4 new gems appear nearby.

**The grand finale:** after you beat **level 5**, the objective changes —
now you must find the one and only **BEDAZZLED OCTOPUS** 🐙💎 (an octopus
covered head-to-tentacle in sparkling gems!) somewhere in the ocean. Follow
the sparkles, reach it, and you win the whole adventure! 🎉

**Make it yours:** pick your fish's color and name on the start screen
(the game remembers for next time).

The ocean is full of friendly creatures too: octopuses 🐙, jellyfish, sea
turtles 🐢, a giant gentle whale 🐋, seahorses, scuttling crabs 🦀,
clownfish living in the anemones, starfish, and a little school of fish
just swimming around.

## Controls

| Action | Keys |
|--------|------|
| Swim forward / back | `W` / `S` or `↑` / `↓` |
| Turn left / right | `A` / `D` or `←` / `→` |
| Swim up | `Space` |
| Swim down | `Shift` |

On a phone or tablet, use the on-screen joystick and the ⬆️ / ⬇️ buttons.

## 🏆 High-score leaderboard

Every gem is worth **100 points** and every crown **500** — your score keeps
growing as long as your run survives. Tap **🏆 High Scores** on the start
screen (or after a game) to see the top 10.

Scores are always saved on the device. To share one leaderboard across all
your devices (and the whole family), connect a free
[Supabase](https://supabase.com) project:

1. Create a project at supabase.com (the free plan is plenty)
2. Open the **SQL Editor** and run the contents of
   [`supabase-setup.sql`](supabase-setup.sql)
3. In **Project Settings → API**, copy the *Project URL* and *anon public*
   key into [`leaderboard-config.js`](leaderboard-config.js)

That's it — the anon key is safe to publish because the database rules only
allow adding and reading scores. If the internet is down, the game quietly
falls back to the on-device scores.

## Running the game

No build step, no dependencies to install (Three.js is bundled in `lib/`).
Just serve the folder and open it in a browser:

```bash
npx http-server .
# then open http://localhost:8080
```

(Any static file server works — it just can't be opened straight from
`file://` because the game uses JavaScript modules.)
