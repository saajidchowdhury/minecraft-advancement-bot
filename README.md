# Minecraft Advancement Bot

A robot player for your Minecraft world. It joins your game as **Bot**
and plays survival on its own, working through advancements: tools, iron,
diamonds, all the way to a Nether portal. You just watch.

The bot needs no separate Minecraft account, API key, or coding for LAN play.

## What you need

- **Minecraft: Java Edition 26.1.2** (not Bedrock)
- **A Mac** (Windows instructions are [further down](#windows))

## Setup (one time)

1. **Download the bot.** At the top of this page, click the green **Code**
   button, then **Download ZIP**. Double-click the downloaded ZIP to get a folder
   called `minecraft-advancement-bot-main`. Put it somewhere easy, such as your
   Desktop.
2. **Use version 26.1.2.** In the Minecraft Launcher, click **Installations** →
   **New installation**, choose version **26.1.2**, click **Create**, and play
   using that installation.

## Every time you play

1. **Open your world to LAN.**
   - In Minecraft, open a survival world from **Singleplayer**.
   - Press **Esc**, then click **Open to LAN**.
   - Click **Start LAN World**.
   - Chat shows **Local game hosted on port 12345**. Remember that number
     (yours will be different, and it changes each time).
2. **Start the bot.** Open the bot folder and double-click
   **`Start Bot.command`**. A window opens.
   - The first time, it downloads what it needs. This takes about a minute.
   - Type the port number and press **Enter**.
3. **Watch.** Bot joins your world and gets to work. Keep Minecraft
   open while it plays.

**To stop the bot,** close its window.

> **Mac says it can't open the file?** Click **Done**. Open **System Settings**
> → **Privacy & Security**, scroll down, and click **Open Anyway** next to
> `Start Bot.command`. Double-click it again and confirm.

## Talk to the bot

Press **T** in Minecraft, type one of these, and press **Enter**.

| Type | What happens |
| --- | --- |
| `!come` | The bot comes to you and follows you |
| `!resume` | The bot goes back to work |
| `!pause` | The bot stops and waits |
| `!status` | The bot says what it is doing |
| `!inventory` | The bot lists what it is carrying |
| `!advancements` | The bot lists the advancements it has earned |

When night comes, go to bed. If the bot can see that you are sleeping and find
a safe bed, it will join you.

## Windows

Windows has not been tested yet.

1. Install **Node.js** (the LTS version) from [nodejs.org](https://nodejs.org).
2. Follow the steps above, but double-click **`Start Bot.bat`** instead. If
   Windows says it protected your PC, click **More info** → **Run anyway**.

## Not working?

- **The bot never joins.** Check that the world is still open to LAN and that
  you typed the port from *this* session. The number changes each time.
- **It says the version is unsupported.** Play with Minecraft **26.1.2**.
- **Something else.** [Open an issue](https://github.com/saajidchowdhury/minecraft-advancement-bot/issues)
  and paste what the bot window says.

Technical details are in [DEVELOPMENT.md](DEVELOPMENT.md).
