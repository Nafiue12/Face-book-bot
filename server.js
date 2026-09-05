// server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import cron from "node-cron";
import crypto from "crypto";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var CONFIG_FILE = path.join(process.cwd(), "bot-config.json");
var app = express();
app.use(express.json());
async function getBotConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (parsed.scheduleTime && !parsed.scheduleTimes) {
      parsed.scheduleTimes = [parsed.scheduleTime];
    }
    if (!parsed.scheduleTimes) {
      parsed.scheduleTimes = ["09:00"];
    }
    if (!parsed.webhookSecret) {
      parsed.webhookSecret = crypto.randomBytes(16).toString("hex");
      await fs.writeFile(CONFIG_FILE, JSON.stringify(parsed, null, 2), "utf-8");
    }
    return parsed;
  } catch (error) {
    const defaultSecret = process.env.WEBHOOK_SECRET || crypto.randomBytes(16).toString("hex");
    return {
      isActive: process.env.AUTO_POST_ACTIVE === "true" || false,
      scheduleTimes: process.env.SCHEDULE_TIMES ? process.env.SCHEDULE_TIMES.split(",") : ["09:00"],
      fbPageId: process.env.FB_PAGE_ID || "",
      igUserId: process.env.IG_USER_ID || "",
      accessToken: process.env.FB_ACCESS_TOKEN || "",
      webhookSecret: defaultSecret
    };
  }
}
async function saveBotConfig(config) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}
var HISTORY_FILE = path.join(process.cwd(), "post-history.json");
async function getPostHistory() {
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}
async function saveToHistory(id) {
  try {
    const history = await getPostHistory();
    if (!history.includes(id)) {
      history.push(id);
      if (history.length > 150) history.shift();
      await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
    }
  } catch (error) {
    console.error("Error saving to history:", error);
  }
}
var FITNESS_LIBRARY = [
  {
    category: "Science",
    fact: "Muscle memory is real: Myonuclei gained during training remain even after you stop training, making it easier to regain lost muscle.",
    caption: "Don't stress if you took a break! Your muscles remember. \u{1F9E0}\u{1F4AA} Get back in the gym and watch how fast you bounce back!",
    hashtags: "#FitnessFacts #MuscleMemory #GymMotivation #Comeback",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/20713720/",
    image_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Science",
    fact: "Lifting weights can improve your sleep quality. Studies show resistance training can help you fall asleep faster and sleep deeper.",
    caption: "Struggling to catch some Zzz's? Pick up some heavy weights! \u{1F3CB}\uFE0F\u200D\u2640\uFE0F\u{1F4A4} A good workout is the best sleep aid.",
    hashtags: "#SleepBetter #WeightLifting #GymLife #FitnessTips",
    comment_source: "https://www.sleepfoundation.org/physical-activity/weight-training-and-sleep",
    image_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Diet",
    fact: "Drinking enough water can boost your metabolic rate by up to 30% for about an hour.",
    caption: "Stay hydrated! \u{1F4A7} It's not just about performance, it's about keeping your metabolism firing all day long. Drink up!",
    hashtags: "#Hydration #Metabolism #FitnessFuel #HealthyLifestyle",
    comment_source: "https://www.healthline.com/nutrition/7-health-benefits-of-water",
    image_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Training Methods",
    fact: "Compound exercises (like squats and deadlifts) trigger a higher hormonal response (testosterone and growth hormone) than isolation exercises.",
    caption: "Want to grow? Stick to the basics! \u{1F4C8} Compound lifts are the secret to unlocking your true potential.",
    hashtags: "#CompoundLifts #Squats #Deadlifts #MuscleGrowth",
    comment_source: "https://examine.com/articles/does-working-out-boost-testosterone/",
    image_url: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Diet",
    fact: "Protein timing isn't as strict as we once thought. The 'anabolic window' lasts several hours, not just 30 minutes after your workout.",
    caption: "Take your time, enjoy your post-workout meal! \u{1F969} The '30-minute anabolic window' is a myth. Total daily protein matters most.",
    hashtags: "#NutritionFacts #Protein #GymMyths #FitnessScience",
    comment_source: "https://jissn.biomedcentral.com/articles/10.1186/1550-2783-10-5",
    image_url: "https://images.unsplash.com/photo-1579722820308-d74e571900a9?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Training Methods",
    fact: "Active recovery (like light walking or cycling) clears blood lactate faster than complete rest after intense exercise.",
    caption: "Sore from yesterday? Don't just sit on the couch! \u{1F6B6}\u200D\u2642\uFE0F Light movement speeds up recovery so you can hit it hard again.",
    hashtags: "#ActiveRecovery #FitnessTips #GymLife #Recovery",
    comment_source: "https://www.health.harvard.edu/exercise-and-fitness/the-role-of-active-recovery",
    image_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Motivation",
    fact: "Consistency beats intensity. Research shows working out moderately 4-5 times a week yields better long-term heart health and habit formation than going all-out just once a week.",
    caption: "It's a marathon, not a sprint. \u{1F3C3}\u200D\u2640\uFE0F Show up, do the work, and stay consistent. That's where the magic happens!",
    hashtags: "#Consistency #FitnessJourney #WorkoutMotivation",
    comment_source: "https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/fitness/art-20048269",
    image_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Supplements",
    fact: "Creatine monohydrate is one of the most researched and safest supplements available, proven to increase strength, power output, and muscle mass.",
    caption: "Looking for an edge? Creatine is the real deal. \u{1F680} Fully backed by science for strength and power gains!",
    hashtags: "#Supplements #Creatine #StrengthGains #ScienceBacked",
    comment_source: "https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0173-z",
    image_url: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Supplements",
    fact: "Caffeine before a workout doesn't just wake you up; it reduces your perceived exertion, meaning heavy weights literally feel lighter.",
    caption: "Pre-workout power! \u2615 Caffeine is scientifically proven to make your workouts feel easier so you can push harder.",
    hashtags: "#PreWorkout #Caffeine #GymHacks #PerformanceBoost",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/27474846/",
    image_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Expert Suggestion",
    fact: "Always prioritize form over weight. Ego lifting is the fastest path to an injury that could set your progress back by months.",
    caption: "Leave your ego at the door! \u{1F6AA} Perfecting your form leads to better muscle activation and keeps you injury-free.",
    hashtags: "#FormCheck #GymAdvice #InjuryPrevention #SmartTraining",
    comment_source: "Certified Personal Trainer Consensus",
    image_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Diet",
    fact: "Your body needs carbohydrates to replenish glycogen stores after an intense workout. Don't fear the carbs!",
    caption: "Carbs are your friend! \u{1F35A}\u{1F35E} Replenishing your energy stores is crucial for recovery and tomorrow's performance.",
    hashtags: "#Nutrition #Carbs #PostWorkout #HealthyDiet",
    comment_source: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6019055/",
    image_url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Training Methods",
    fact: "Progressive Overload is the fundamental law of muscle growth. You must continually increase weight, reps, or volume over time.",
    caption: "If it doesn't challenge you, it doesn't change you! \u{1F4CA} Keep tracking your lifts and pushing for that extra rep or pound.",
    hashtags: "#ProgressiveOverload #MuscleBuilding #TrainingTips",
    comment_source: "https://www.nsca.com/education/articles/kinetic-select/progressive-overload/",
    image_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1080&auto=format&fit=crop"
  }
];
async function fetchFromReddit() {
  const redditSources = [
    { sub: "Fitness", cat: "Community Insight" },
    { sub: "nutrition", cat: "Diet" },
    { sub: "diet", cat: "Diet" },
    { sub: "Supplements", cat: "Supplements" },
    { sub: "bodyweightfitness", cat: "Training Methods" },
    { sub: "weightlifting", cat: "Training Methods" },
    { sub: "AdvancedFitness", cat: "Science" }
  ];
  const randomSource = redditSources[Math.floor(Math.random() * redditSources.length)];
  const randomSub = randomSource.sub;
  const response = await fetch(`https://www.reddit.com/r/${randomSub}/top.json?t=month&limit=30`, {
    headers: { "User-Agent": "DailyGymFactBot/1.0" }
  });
  const data = await response.json();
  const history = await getPostHistory();
  if (data?.data?.children) {
    const posts = data.data.children.sort(() => Math.random() - 0.5);
    for (const child of posts) {
      const post = child.data;
      const postId = `reddit_${post.id}`;
      if (!history.includes(postId) && !post.over_18 && post.title.length > 15) {
        return {
          id: postId,
          category: randomSource.cat,
          fact: post.title,
          caption: `Insights from the community! \u{1F4AA}

${post.selftext ? post.selftext.substring(0, 150) + "..." : ""}`,
          hashtags: `#${randomSub} #FitnessJourney #GymTips`,
          comment_source: `https://reddit.com${post.permalink}`
        };
      }
    }
  }
  return null;
}
async function fetchFromWger() {
  try {
    const offset = Math.floor(Math.random() * 200);
    const response = await fetch(`https://wger.de/api/v2/exerciseinfo/?language=2&limit=20&offset=${offset}`);
    const data = await response.json();
    const history = await getPostHistory();
    if (data && data.results && data.results.length > 0) {
      const exercises = data.results.sort(() => Math.random() - 0.5);
      for (const ex of exercises) {
        const exId = `wger_${ex.id}`;
        if (!history.includes(exId) && ex.description) {
          const cleanDesc = ex.description.replace(/<[^>]*>?/gm, "").substring(0, 150) + "...";
          return {
            id: exId,
            category: "Training Methods",
            fact: `Exercise Spotlight: ${ex.name}`,
            caption: `Looking to mix up your routine? Try the ${ex.name}!

${cleanDesc}

Target Muscles: ${ex.category?.name || "Full Body"}. Let's get to work! \u{1F4AA}\u{1F3CB}\uFE0F\u200D\u2642\uFE0F`,
            hashtags: "#TrainingMethods #WorkoutIdea #GymRoutine",
            comment_source: "https://wger.de"
          };
        }
      }
    }
  } catch (err) {
    console.error("Error fetching from wger", err);
  }
  return null;
}
async function fetchFromZenQuotes() {
  const response = await fetch("https://zenquotes.io/api/random");
  const data = await response.json();
  const history = await getPostHistory();
  if (data && data.length > 0) {
    const quote = data[0];
    const quoteId = `quote_${Buffer.from(quote.q.substring(0, 15)).toString("base64")}`;
    if (!history.includes(quoteId)) {
      return {
        id: quoteId,
        category: "Motivation",
        fact: `"${quote.q}"
- ${quote.a}`,
        caption: "Stay motivated and keep pushing forward! \u{1F4AF}\u{1F525} Mindset is everything when it comes to hitting your goals.",
        hashtags: "#Motivation #FitnessMindset #KeepGoing #GymMotivation",
        comment_source: "https://zenquotes.io/"
      };
    }
  }
  return null;
}
async function fetchFromHealthNews() {
  const response = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.sciencedaily.com%2Frss%2Fhealth_medicine%2Ffitness.xml");
  const data = await response.json();
  const history = await getPostHistory();
  if (data.status === "ok" && data.items) {
    const items = data.items.sort(() => Math.random() - 0.5);
    for (const item of items) {
      const newsId = `news_${Buffer.from(item.guid || item.title).toString("base64").substring(0, 20)}`;
      if (!history.includes(newsId)) {
        return {
          id: newsId,
          category: "Science",
          fact: `New Fitness Study: ${item.title}`,
          caption: `Did you know? \u{1F914} 
${item.description ? item.description.replace(/<[^>]*>?/gm, "").substring(0, 120) + "..." : "Fascinating new fitness research just dropped!"}

Stay informed and keep growing! \u{1F4DA}\u{1F4AA}`,
          hashtags: "#FitnessScience #HealthNews #FitnessResearch",
          comment_source: item.link
        };
      }
    }
  }
  return null;
}
async function generateAiPostData(config) {
  const history = await getPostHistory();
  const sources = [fetchFromReddit, fetchFromHealthNews, fetchFromZenQuotes, fetchFromWger];
  sources.sort(() => Math.random() - 0.5);
  let postData = null;
  for (const sourceFn of sources) {
    try {
      postData = await sourceFn();
      if (postData) break;
    } catch (err) {
      console.error(`Source fetch failed, trying next...`);
    }
  }
  if (!postData) {
    console.log("All APIs failed or returned duplicate content. Falling back to local library.");
    let availableFacts = FITNESS_LIBRARY.filter((item) => {
      const fallbackId = `fallback_${Buffer.from(item.fact.substring(0, 15)).toString("base64")}`;
      return !history.includes(fallbackId);
    });
    if (availableFacts.length === 0) {
      console.log("All fallback facts used! Resetting local pool.");
      availableFacts = [...FITNESS_LIBRARY];
    }
    const randomIndex = Math.floor(Math.random() * availableFacts.length);
    const selected = availableFacts[randomIndex];
    postData = {
      id: `fallback_${Buffer.from(selected.fact.substring(0, 15)).toString("base64")}`,
      ...selected
    };
  }
  const randomSeed = Math.floor(Math.random() * 1e4);
  postData.image_url = `https://loremflickr.com/1080/1080/fitness,gym/all?lock=${randomSeed}`;
  return postData;
}
async function publishToSocialMedia(postData, config) {
  const { fbPageId, igUserId, accessToken } = config;
  const imageUrl = postData.image_url;
  const fullCaption = `${postData.fact}

${postData.caption}

${postData.hashtags}`;
  console.log("Initiating automated post to social media...");
  const results = { fb: false, ig: false, errors: [] };
  if (fbPageId) {
    try {
      const verifyRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${accessToken}`);
      const verifyData = await verifyRes.json();
      if (verifyData.error) {
        throw new Error(`Invalid Token: ${verifyData.error.message}`);
      }
      if (verifyData.id !== fbPageId) {
        throw new Error(`Token Identity Mismatch! This token belongs to "${verifyData.name}" (ID: ${verifyData.id}), but your Settings Page ID is ${fbPageId}. If "${verifyData.name}" is your personal name, you are still using a User Token. You MUST copy the token that appears AFTER you select your Page from the Graph API Explorer dropdown.`);
      }
      const fbRes = await fetch(`https://graph.facebook.com/v19.0/${fbPageId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl, message: fullCaption, access_token: accessToken })
      });
      const fbData = await fbRes.json();
      if (fbData.error) {
        let errorMsg = fbData.error.message;
        if (fbData.error.code === 200 && errorMsg.includes("other users' timelines")) {
          errorMsg = "Facebook Error: 'Not allowed to publish to other users timelines'. This usually means the Facebook Page ID you entered in Settings is actually your personal Profile ID, OR you are using a User Access Token instead of a Page Token. Please double-check your Page ID.";
        }
        throw new Error(errorMsg);
      }
      const fbPostId = fbData.post_id || fbData.id;
      await fetch(`https://graph.facebook.com/v19.0/${fbPostId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Source: ${postData.comment_source}`, access_token: accessToken })
      });
      console.log("Successfully posted to Facebook");
      results.fb = true;
    } catch (e) {
      console.error("Facebook posting failed:", e.message);
      results.errors.push(`Facebook: ${e.message}`);
    }
  }
  if (igUserId) {
    try {
      const igMediaRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, caption: fullCaption, access_token: accessToken })
      });
      const igMediaData = await igMediaRes.json();
      if (igMediaData.error) throw new Error(igMediaData.error.message);
      const igPublishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: igMediaData.id, access_token: accessToken })
      });
      const igPublishData = await igPublishRes.json();
      if (igPublishData.error) throw new Error(igPublishData.error.message);
      await fetch(`https://graph.facebook.com/v19.0/${igPublishData.id}/replies`, {
        // Note: IG uses replies/comments on media
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Source: ${postData.comment_source}`, access_token: accessToken })
      });
      console.log("Successfully posted to Instagram");
      results.ig = true;
    } catch (e) {
      console.error("Instagram posting failed:", e.message);
      results.errors.push(`Instagram: ${e.message}`);
    }
  }
  if ((results.fb || results.ig) && postData.id) {
    await saveToHistory(postData.id);
  }
  return results;
}
var currentTasks = [];
function setupCronJob(config) {
  currentTasks.forEach((task) => task.stop());
  currentTasks = [];
  if (config.isActive) {
    let times = [];
    if (Array.isArray(config.scheduleTimes)) {
      times = config.scheduleTimes;
    } else if (config.scheduleTime) {
      times = [config.scheduleTime];
    }
    times.forEach((time) => {
      const [hour, minute] = time.split(":");
      if (hour && minute) {
        const cronExpression = `${minute} ${hour} * * *`;
        const tz = config.timezone || "UTC";
        console.log(`Setting up daily auto-post cron for ${hour}:${minute} in timezone ${tz}`);
        const task = cron.schedule(cronExpression, async () => {
          console.log(`Cron triggered (${hour}:${minute} ${tz}): Generating and posting content...`);
          try {
            const postData = await generateAiPostData();
            const currentConfig = await getBotConfig();
            await publishToSocialMedia(postData, currentConfig);
          } catch (error) {
            console.error(`Automated posting failed (${hour}:${minute} ${tz}):`, error);
          }
        }, {
          scheduled: true,
          timezone: tz
        });
        currentTasks.push(task);
      }
    });
  }
}
app.get("/api/config", async (req, res) => {
  const config = await getBotConfig();
  res.json(config);
});
app.post("/api/config", async (req, res) => {
  try {
    const newConfig = req.body;
    if (!newConfig.webhookSecret) {
      const existingConfig = await getBotConfig();
      newConfig.webhookSecret = existingConfig.webhookSecret;
    }
    await saveBotConfig(newConfig);
    setupCronJob(newConfig);
    res.json({ success: true, message: "Configuration saved and scheduler updated" });
  } catch (error) {
    res.status(500).json({ error: "Failed to save configuration" });
  }
});
app.get("/api/webhook/cron", async (req, res) => {
  try {
    const config = await getBotConfig();
    const providedSecret = req.query.secret;
    if (!config.webhookSecret || providedSecret !== config.webhookSecret) {
      return res.status(200).send("NO");
    }
    console.log("External Keep-Alive Webhook triggered. Server is awake.");
    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook keep-alive failed:", error);
    res.status(200).send("ERR");
  }
});
app.post("/api/generate-post", async (req, res) => {
  try {
    const data = await generateAiPostData();
    res.json(data);
  } catch (error) {
    console.error("Error generating post:", error);
    res.status(500).json({ error: error.message || "Failed to generate post" });
  }
});
app.post("/api/publish-now", async (req, res) => {
  try {
    const config = await getBotConfig();
    if (!config.fbPageId && !config.igUserId) {
      return res.status(400).json({ error: "Please configure Facebook Page ID or Instagram Account ID in Settings first." });
    }
    if (!config.accessToken) {
      return res.status(400).json({ error: "Please configure Meta Access Token in Settings first." });
    }
    const postData = await generateAiPostData();
    const publishResults = await publishToSocialMedia(postData, config);
    if (publishResults.errors.length > 0 && !publishResults.fb && !publishResults.ig) {
      return res.status(500).json({ error: "Failed to publish: " + publishResults.errors.join(", ") });
    }
    res.json({ success: true, postData, results: publishResults });
  } catch (error) {
    console.error("Error publishing post immediately:", error);
    res.status(500).json({ error: error.message || "Failed to publish post immediately" });
  }
});
async function startServer() {
  const isProd = process.env.NODE_ENV === "production";
  const port = process.env.PORT || 3e3;
  const initialConfig = await getBotConfig();
  setupCronJob(initialConfig);
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.use("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  }
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}
startServer();
