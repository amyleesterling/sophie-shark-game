# 🐠 Sophie's Shark & Fish Game 🦈

A 3D underwater adventure **designed by Sophie (age 6, almost 7!)** 💛

**▶️ Play it here: https://amyleesterling.github.io/sophie-shark-game/**
(works on computers, phones, and tablets)

## How to play

You are a little fish in a big open ocean. Collect all **4 gems 💎** to win —
but watch out for the **sharks**! If they see you, they'll chase you.
**Hide behind the coral 🪸** and they can't see you at all.

You have **3 lives ❤️❤️❤️**.

### Gem powers (Sophie's rules!)

| Gem | Power |
|-----|-------|
| 💎 1st gem | You get to swim **super fast** ⚡ |
| 💎 2nd gem | The sharks fall asleep — you get a **5 second head start** 😴 |
| 💎 3rd gem | You leave a **sparkle trail** ✨ |
| 💎 4th gem | **YOU WIN!** 🎉 |

The ocean is full of friendly creatures too: octopuses 🐙, jellyfish, sea
turtles 🐢, starfish, and a little school of fish just swimming around.

## Controls

| Action | Keys |
|--------|------|
| Swim forward / back | `W` / `S` or `↑` / `↓` |
| Turn left / right | `A` / `D` or `←` / `→` |
| Swim up | `Space` |
| Swim down | `Shift` |

On a phone or tablet, use the on-screen joystick and the ⬆️ / ⬇️ buttons.

## Running the game

No build step, no dependencies to install (Three.js is bundled in `lib/`).
Just serve the folder and open it in a browser:

```bash
npx http-server .
# then open http://localhost:8080
```

(Any static file server works — it just can't be opened straight from
`file://` because the game uses JavaScript modules.)
