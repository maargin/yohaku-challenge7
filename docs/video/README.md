# Video assets

- `the-system-silent.mp4` (not committed; 1920×1080, 30 fps, no audio, 1:52): the screen recording of the site following the storyboard, starting with the two title cards. The presenter adds a 10-second introduction in front and records the voice-over.
- `b*.jpg`: the storyboard screenshots.

## Beat times in the silent video (seconds from its start)

| Beat | Starts at | With a 10 s intro in front |
|---|---|---|
| Card 1 · "What can we learn from mycelium?" | 0.0 | 0:10 |
| Card 2 · "Not its morality." | 12.0 | 0:22 |
| 4 · Encounter, on course to collide | 20.0 | 0:30 |
| 5 · Decision dialog, approve | 39.3 | 0:49 |
| 6 · The burn, the new path | 48.7 | 0:59 |
| 7 · Decision flow | 56.4 | 1:06 |
| 8 · Pick two real objects | 72.0 | 1:22 |
| 9 · The real pair plays | 81.7 | 1:32 |
| 10 · Results | 88.6 | 1:39 |
| 11 · Governance | 100.7 | 1:51 |
| End | 111.7 | 2:02 |

## Adding the voice-over

With the presenter's audio file (any common format) and the intro clip:

```bash
# 1. put the intro in front (re-encode both to the same format first if needed)
ffmpeg -i intro.mp4 -i the-system-silent.mp4 -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0[v]" -map "[v]" -c:v libx264 -crf 20 -pix_fmt yuv420p -r 30 full-silent.mp4
# 2. lay the voice-over on top
ffmpeg -i full-silent.mp4 -i voiceover.m4a -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -shortest the-system.mp4
```
