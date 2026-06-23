# Logos Meditation App

A premium, distraction-free monastic web space designed to store, manage, and play scripture meditation cards in automatic slideshow loops with ambient sound pads and persistent reflection journaling.

---

## Key Features

* **Bible Meditation Collections**: Group your scripture cards into logical themes (e.g., *Healing Scriptures*, *Peace & Stillness*, *Strength & Courage*). Customize each collection with its own color theme, countdown timing, and background music.
* **Auto-Play Slideshow Mode**: Displays scripture verses sequentially. It counts down with an elegant SVG circular progress timer and advances to the next verse automatically once the timer reaches zero.
* **Ambient Synthesizer (Celestial Pad)**: Generates soft, evolving pentatonic ambient chords natively in your browser using the **Web Audio API**. It works completely offline and requires zero network requests or heavy audio files.
* **Audio Preset Loops**: Includes built-in support for ambient presets (Lofi, Acoustic Guitar, Streams) as well as custom external MP3/WAV links.
* **Live Reflection Journaling**: Write and edit personal notes for each card directly inside the slideshow player while the scripture is displayed. Notes save automatically to `localStorage` as you type.
* **Collection Card CRUD**: Fully editable structure. Click the settings icon (`⚙`) on any collection to add cards, modify content, delete cards, or adjust slide timeouts.

---

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (Recommended: Node 20.19+ or Node 22.11+)
* A modern web browser supporting the Web Audio API (Chrome, Safari, Firefox, Edge)

### Installation
1. Open your terminal in the `meditate` project directory.
2. Install the package dependencies:
   ```bash
   npm install
   ```

### Running the App
Start the local development server:
```bash
npm run dev
```
Once the server starts, open your browser and navigate to the address shown in your terminal (usually [http://localhost:5173](http://localhost:5173)).

### Building for Production
To bundle and compile the application for production deployment:
```bash
npm run build
```
The compiled, optimized HTML/JS/CSS assets will be written to the `dist` directory.

---

## How to Use

### 1. Creating a Collection
* Click **Create Collection** in the top right.
* Name your collection (e.g., "Peace & Rest").
* Choose a **Color Theme** (e.g., Peace, Hope, Love) which will determine the visual gradient and glow during your meditation session.
* Select a **Music Option** (e.g., *Celestial Pad (Synth)*) and a **Default Timeout** in seconds (e.g., `30` seconds per card).
* Click **Save Changes**.

### 2. Managing Meditation Cards
* Click the settings gear icon (`⚙`) on your newly created collection to open the Card Manager.
* Click **Add Card** to add a new Scripture slide.
* Enter the **Bible Reference** (e.g., `John 3:16`) and the **Scripture Content** text.
* Optionally, define a **Custom Timeout** in seconds for this card if it requires more or less reflection time than the collection's default.
* Provide initial **Reflection Notes** if desired.
* Save the card. It will immediately appear in your collection's card list.

### 3. Running a Meditation Session
* Click **Play Collection** on any card.
* The player will fill the viewport with your collection's custom color glow.
* Ambient background music will begin playing.
* Use the playback controls at the bottom to:
  * **Pause/Play**: Halt or resume the automated slide countdown.
  * **Skip Back/Forward**: Manually advance or return to a verse.
  * **Hide/Write Notes**: Toggle the reflection text box drawer.
* Type reflection thoughts, prayers, or declarations in the **Reflection Journal Notes** box. Notes are saved immediately to `localStorage`.
* When the session reaches the final card, a peaceful completion screen will display a recap of all the verses you reflected on.
