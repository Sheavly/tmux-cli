# Setup

```
npm run setup
```

sets sheavly-tmux up on a computer that has only a clone of this repository. It asks before it
does anything that is yours to decide, it can be run again, and it stops at the first thing that
is wrong with a message that says what to do. It needs Node 24+ and git (and tmux 3.3+ and npm,
which it checks).

## What it does

1. **Checks the computer.** tmux 3.3 or newer and npm. If tmux is missing or too old it prints the
   install command for your package manager and stops, and it never runs it. Windows is not
   supported (tmux is not); use WSL. A missing clipboard tool is only a note.
2. **Installs our dependencies** with `npm ci`, unless they are there.
3. **Finds or clones the sheavly harness.** It asks whether you have it on this computer.
   - **No:** it asks where to clone it to (default `~/harness`, which is where sheavly-tmux looks
     without any config), clones the public repository, installs its dependencies and builds it.
   - **Yes:** it asks where it is (and again if that is not the harness), installs its
     dependencies if they are not there, and builds it. The build is incremental, so it takes no
     time when nothing changed, and running it always is how a build that went stale is caught.
     It also asks whether to run the harness from its build (the default) or from source (mode
     `dev`, the harness's own dev script with tsx), for working on the harness itself. It never
     pulls or changes your checkout.
4. **Writes the config**, `~/.config/sheavly-tmux/config.json`, with only what is not the default:
   `harnessDir` when the harness is not at `~/harness`, and `mode` when it is `dev`. A setting your
   file already has is asked about and never overwritten without a yes; with no changes to make
   it writes nothing.
5. **Looks for a profile** (a model and its key, in `~/.sheavly`, or `SHEAVLY_HOME`). If there is
   none it offers to open the harness's own setup wizard. The wizard takes your models and keys
   itself: sheavly-tmux never sees them. It opens a chat when it finishes, which you leave with
   `/exit`; it runs from your home folder, so no project gets a conversation for it.
6. **Offers the `sheavly-tmux` command** with `npm link`. If a global link is not allowed on this
   computer (a system Node without sudo) it prints an alias to use instead.
7. **Checks the result** the way sheavly-tmux will see it: the config it loads, the harness that
   names, whether it is built, and that the stored chats can be read.

## Options

```
npm run setup -- --help
```

| Option                | Does                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `--harness <path>`    | use the harness that is already at `<path>`                         |
| `--clone <folder>`    | clone the harness into `<folder>`                                   |
| `--harness-url <url>` | clone from here instead of `https://github.com/Sheavly/harness.git` |
| `--mode built\|dev`   | run the harness from its build (the default) or from source         |
| `--link`, `--no-link` | make `sheavly-tmux` a command, or not (the default is to ask)       |
| `--yes`, `-y`         | take every default instead of asking                                |

Without a terminal and without `--yes` it cannot ask, so it says so and stops before changing
anything. `--yes` with no harness found clones it to `~/harness`; it never opens the harness
wizard, since that needs a person.

## By hand

The setup only does what these do, in this order:

```
npm ci
git clone https://github.com/Sheavly/harness.git ~/harness
cd ~/harness
npm ci
npm run build -w @sheavly/terminal
node apps/terminal/dist/chat.js --setup
cd -
npm link
```

and a `~/.config/sheavly-tmux/config.json` when the harness is not at `~/harness` (see Settings
in the README). `--setup` is the harness's wizard for a profile, models and keys.

## If it prints a Corepack message

"Corepack is about to download npm-…" is the harness pinning the npm version it is built with. It
is not an error: Corepack fetches that npm once and the install goes on.

## Updating the harness

Pull it and run the setup again: the build is incremental, so it rebuilds what changed. The setup
does not pull for you, so it never touches a checkout you are working in.
