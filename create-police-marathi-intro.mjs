import { mkdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire("C:/hotels-in-alibaug/guest-checkin/slideshow/generate-marathi-narration.mjs");
const { EdgeTTS, Constants } = require("C:/hotels-in-alibaug/guest-checkin/slideshow/.tts-work/node_modules/@andresaya/edge-tts/dist/index.js");
const dir = "C:/Users/gjpat/.codex/visualizations/2026/07/25/019f9725-e843-78c3-840c-539c3894ce28/police-intro-mr-audio";
const lines = [
  "नमस्कार. अलीबागमधील अधिकृत पोलीस अधिकारी आणि सहभागी हॉटेल यांच्यात जबाबदार व पारदर्शक समन्वयासाठी चेकइनचे पोलीस अॅक्सेस मॉड्यूल सादर करत आहोत. कायदेशीर चौकशीच्या वेळी आवश्यक माहिती स्पष्ट पद्धतीने मिळावी आणि प्रत्येक अॅक्सेसची नोंद राहावी, हा याचा उद्देश आहे.",
  "अलीबागमध्ये रोज पर्यटक, कुटुंबे आणि नव्या संधी येत आहेत. प्रत्येक पाहुण्याचे स्वागत आपुलकीने व्हावे, आणि हॉटेलची नोंद व्यवस्थित राहावी, यासाठी सोपी आणि व्यावसायिक प्रक्रिया उपयुक्त ठरते.",
  "गरज पडल्यास, अधिकृत अधिकारी आणि हॉटेल व्यवस्थापन यांच्यातील समन्वय स्पष्ट, मर्यादित आणि जबाबदार असणे महत्त्वाचे आहे. ही प्रणाली प्रस्थापित पोलीस प्रक्रियेची जागा घेत नाही; ती त्यासाठी एक सुबक आणि नियंत्रित सहाय्यक मार्ग देण्याचा प्रयत्न करते.",
  "चेकइनमध्ये अधिकृत शोध, संबंधित हॉटेलची माहिती आणि अॅक्सेसची नोंद एका नियंत्रित प्रक्रियेत आणली जाते. अलीबागमधील हॉटेलसह या पोलीस अॅक्सेस मॉड्यूलचे प्रात्यक्षिक आणि पायलट करण्यासाठी आपली मान्यता विनम्रपणे अपेक्षित आहे. धन्यवाद."
];
await mkdir(dir,{recursive:true}); const timings=[];
for(const [i,text] of lines.entries()){const t=new EdgeTTS();await t.synthesize(text,"mr-IN-AarohiNeural",{rate:"-8%",volume:"94%",pitch:"+0Hz",outputFormat:Constants.OUTPUT_FORMAT.AUDIO_48KHZ_96KBITRATE_MONO_MP3});const file=await t.toFile(`${dir}/slide-${String(i+1).padStart(2,"0")}`);timings.push({seconds:Number(((await stat(file)).size*8/96000).toFixed(2))});}
await writeFile(`${dir}/timings.json`,JSON.stringify(timings)); console.log(timings);
