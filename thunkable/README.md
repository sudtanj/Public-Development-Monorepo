# Thunkable apps

Two [Thunkable Classic](https://thunkable.com) Android apps from 2017, moved here from
[`sudtanj/thunkable-apps`](https://github.com/sudtanj/thunkable-apps). Each `.aia` file is a full project export
(App Inventor format): the screen layout (`.scm`), the blocks (`.bky`), assets and any extensions.

| Project | What it does | Components |
| --- | --- | --- |
| [`CamVision_Thunkable.aia`](CamVision_Thunkable.aia) | Camera app with image and emotion recognition, plus the Makeblock CamVision extension | Camera, ImagePicker, ImageRecognizer, EmotionRecognizer, CamVision |
| [`QRCodeGenerator_Thunkable.aia`](QRCodeGenerator_Thunkable.aia) | Generates QR codes from text and scans them back | TextBox, Web, Canvas, BarcodeScanner, Clock |

## Play in the browser

**[▶ Open the showcase](https://sudtanj.github.io/Public-Development-Monorepo/)**. The player
(`site/aia/`) unzips the `.aia` in the browser and draws the screen from its designer file. It runs the app's
blocks in a small interpreter and shows them as readable code. The QR code generator works end to end. For CamVision,
taking or picking a photo works; the recognition features need Thunkable's cloud services, so they're only logged.

## Opening a project

Thunkable Classic has been shut down, and the current Thunkable can't import `.aia` files. To open these:

- **MIT App Inventor:** go to <https://ai2.appinventor.mit.edu>, choose *Projects → Import project (.aia)*. Standard
  components load fine. The Thunkable-only components (`ImageRecognizer`, `EmotionRecognizer`) don't exist in App
  Inventor, so CamVision needs those parts rebuilt.
- **Inspect the source:** an `.aia` is a zip, so `unzip -l <file>.aia` lists the screens, blocks and assets.

## CI

`.github/workflows/aia.yml` checks that every `*.aia` here is a valid project archive. On `main`, it uploads
the archives as an `aia-projects` workflow artifact so you can download and import them.
Thunkable has no public deploy API, so the workflow can't push projects to a Thunkable account.
