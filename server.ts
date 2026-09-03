import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import cron from 'node-cron';
import crypto from 'crypto';

// Use a type alias for config if desired, or handle inside getBotConfig

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(process.cwd(), 'bot-config.json');

const app = express();
app.use(express.json());

// Helper functions for config
async function getBotConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (parsed.scheduleTime && !parsed.scheduleTimes) {
      parsed.scheduleTimes = [parsed.scheduleTime];
    }
    if (!parsed.scheduleTimes) {
      parsed.scheduleTimes = ['09:00'];
    }
    if (!parsed.webhookSecret) {
      parsed.webhookSecret = crypto.randomBytes(16).toString('hex');
      await fs.writeFile(CONFIG_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
    }
    return parsed;
  } catch (error) {
    const defaultSecret = process.env.WEBHOOK_SECRET || crypto.randomBytes(16).toString('hex');
    return { 
      isActive: process.env.AUTO_POST_ACTIVE === 'true' || false, 
      scheduleTimes: process.env.SCHEDULE_TIMES ? process.env.SCHEDULE_TIMES.split(',') : ['09:00'], 
      fbPageId: process.env.FB_PAGE_ID || '', 
      igUserId: process.env.IG_USER_ID || '', 
      accessToken: process.env.FB_ACCESS_TOKEN || '', 
      webhookSecret: defaultSecret 
    };
  }
}

async function saveBotConfig(config: any) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// Local Library (No API Required)
const FITNESS_LIBRARY = [
  {
    fact: "Muscle memory is real: Myonuclei gained during training remain even after you stop training, making it easier to regain lost muscle.",
    caption: "Don't stress if you took a break! Your muscles remember. 🧠💪 Get back in the gym and watch how fast you bounce back!",
    hashtags: "#FitnessFacts #MuscleMemory #GymMotivation #Comeback #FitnessJourney",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/20713720/",
    image_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1080&auto=format&fit=crop"
  },
  {
    fact: "Lifting weights can improve your sleep quality. Studies show resistance training can help you fall asleep faster and sleep deeper.",
    caption: "Struggling to catch some Zzz's? Pick up some heavy weights! 🏋️‍♀️💤 A good workout is the best sleep aid.",
    hashtags: "#SleepBetter #WeightLifting #GymLife #FitnessTips #HealthyHabits",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/22751279/",
    image_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1080&auto=format&fit=crop"
  },
  {
    fact: "Drinking enough water can boost your metabolic rate by up to 30% for about an hour.",
    caption: "Stay hydrated! 💧 It's not just about performance, it's about keeping your metabolism firing all day long. Drink up!",
    hashtags: "#Hydration #Metabolism #FitnessFuel #GymMotivation #HealthyLifestyle",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/14671205/",
    image_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=1080&auto=format&fit=crop"
  },
  {
    fact: "Compound exercises (like squats and deadlifts) trigger a higher hormonal response (testosterone and growth hormone) than isolation exercises.",
    caption: "Want to grow? Stick to the basics! 📈 Compound lifts are the secret to unlocking your true potential.",
    hashtags: "#CompoundLifts #Squats #Deadlifts #MuscleGrowth #GymFacts",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/2796409/",
    image_url: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=1080&auto=format&fit=crop"
  },
  {
    fact: "Protein timing isn't as strict as we once thought. The 'anabolic window' lasts several hours, not just 30 minutes after your workout.",
    caption: "Take your time, enjoy your post-workout meal! 🥩 The '30-minute anabolic window' is a myth. Total daily protein matters most.",
    hashtags: "#NutritionFacts #Protein #GymMyths #FitnessScience #EatToGrow",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/23360586/",
    image_url: "https://images.unsplash.com/photo-1579722820308-d74e571900a9?q=80&w=1080&auto=format&fit=crop"
  }
];

// Reusable Generation Logic
async function generateAiPostData(): Promise<any> {
  const randomIndex = Math.floor(Math.random() * FITNESS_LIBRARY.length);
  return FITNESS_LIBRARY[randomIndex];
}

// Automated Posting Logic using Meta Graph API
async function publishToSocialMedia(postData: any, config: any) {
  const { fbPageId, igUserId, accessToken } = config;
  const imageUrl = postData.image_url;
  const fullCaption = `${postData.fact}\n\n${postData.caption}\n\n${postData.hashtags}`;

  console.log('Initiating automated post to social media...');
  const results = { fb: false, ig: false, errors: [] as string[] };

  // 1. Post to Facebook Page
  if (fbPageId) {
    try {
      // Validate token identity
      const verifyRes = await fetch(`https://graph.facebook.com/v19.0/me?access_token=${accessToken}`);
      const verifyData = await verifyRes.json();
      
      if (verifyData.error) {
        throw new Error(`Invalid Token: ${verifyData.error.message}`);
      }
      
      if (verifyData.id !== fbPageId) {
        throw new Error(`Token Identity Mismatch! This token belongs to "${verifyData.name}" (ID: ${verifyData.id}), but your Settings Page ID is ${fbPageId}. If "${verifyData.name}" is your personal name, you are still using a User Token. You MUST copy the token that appears AFTER you select your Page from the Graph API Explorer dropdown.`);
      }

      const fbRes = await fetch(`https://graph.facebook.com/v19.0/${fbPageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      // Add first comment
      await fetch(`https://graph.facebook.com/v19.0/${fbPostId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Source: ${postData.comment_source}`, access_token: accessToken })
      });
      console.log('Successfully posted to Facebook');
      results.fb = true;
    } catch (e: any) {
      console.error('Facebook posting failed:', e.message);
      results.errors.push(`Facebook: ${e.message}`);
    }
  }

  // 2. Post to Instagram
  if (igUserId) {
    try {
      // Step A: Create Media Container
      const igMediaRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl, caption: fullCaption, access_token: accessToken })
      });
      const igMediaData = await igMediaRes.json();
      if (igMediaData.error) throw new Error(igMediaData.error.message);
      
      // Step B: Publish Media
      const igPublishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: igMediaData.id, access_token: accessToken })
      });
      const igPublishData = await igPublishRes.json();
      if (igPublishData.error) throw new Error(igPublishData.error.message);

      // Step C: Comment on Media
      await fetch(`https://graph.facebook.com/v19.0/${igPublishData.id}/replies`, { // Note: IG uses replies/comments on media
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Source: ${postData.comment_source}`, access_token: accessToken })
      });
      console.log('Successfully posted to Instagram');
      results.ig = true;
    } catch (e: any) {
      console.error('Instagram posting failed:', e.message);
      results.errors.push(`Instagram: ${e.message}`);
    }
  }
  
  return results;
}

// Cron Job Setup (Runs every minute to check schedule)
let currentTasks: cron.ScheduledTask[] = [];

function setupCronJob(config: any) {
  // Clear existing tasks
  currentTasks.forEach(task => task.stop());
  currentTasks = [];

  if (config.isActive) {
    let times: string[] = [];
    if (Array.isArray(config.scheduleTimes)) {
      times = config.scheduleTimes;
    } else if (config.scheduleTime) {
      times = [config.scheduleTime];
    }

    times.forEach(time => {
      const [hour, minute] = time.split(':');
      if (hour && minute) {
        // Cron format: minute hour * * *
        const cronExpression = `${minute} ${hour} * * *`;
        console.log(`Setting up daily auto-post cron for ${hour}:${minute}`);
        
        const task = cron.schedule(cronExpression, async () => {
          console.log(`Cron triggered (${hour}:${minute}): Generating and posting content...`);
          try {
            const postData = await generateAiPostData();
            const currentConfig = await getBotConfig(); // get freshest config
            await publishToSocialMedia(postData, currentConfig);
          } catch (error) {
            console.error(`Automated posting failed (${hour}:${minute}):`, error);
          }
        });
        currentTasks.push(task);
      }
    });
  }
}

// API Endpoints
app.get('/api/config', async (req, res) => {
  const config = await getBotConfig();
  res.json(config);
});

app.post('/api/config', async (req, res) => {
  try {
    const newConfig = req.body;
    // ensure webhook secret is preserved if missing from request
    if (!newConfig.webhookSecret) {
       const existingConfig = await getBotConfig();
       newConfig.webhookSecret = existingConfig.webhookSecret;
    }
    await saveBotConfig(newConfig);
    setupCronJob(newConfig);
    res.json({ success: true, message: 'Configuration saved and scheduler updated' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Webhook endpoint for external Cron services
app.get('/api/webhook/cron', async (req, res) => {
  try {
    const config = await getBotConfig();
    const providedSecret = req.query.secret;

    if (!config.webhookSecret || providedSecret !== config.webhookSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing secret parameter' });
    }

    if (!config.isActive) {
      return res.status(400).json({ success: false, error: 'Auto-posting is disabled in app settings.' });
    }

    console.log('External Webhook triggered: Generating and posting content...');
    
    // We start the process and wait for it.
    const postData = await generateAiPostData();
    const publishResults = await publishToSocialMedia(postData, config);
    
    res.json({ success: true, message: 'Post generated and published successfully via webhook.', publishResults });
  } catch (error: any) {
    console.error('Webhook automated posting failed:', error);
    res.status(500).json({ success: false, error: error.message || 'Webhook post generation failed' });
  }
});

app.post('/api/generate-post', async (req, res) => {
  try {
    const data = await generateAiPostData();
    res.json(data);
  } catch (error: any) {
    console.error('Error generating post:', error);
    res.status(500).json({ error: error.message || 'Failed to generate post' });
  }
});

app.post('/api/publish-now', async (req, res) => {
  try {
    const config = await getBotConfig();
    if (!config.fbPageId && !config.igUserId) {
      return res.status(400).json({ error: 'Please configure Facebook Page ID or Instagram Account ID in Settings first.' });
    }
    if (!config.accessToken) {
      return res.status(400).json({ error: 'Please configure Meta Access Token in Settings first.' });
    }
    
    const postData = await generateAiPostData();
    const publishResults = await publishToSocialMedia(postData, config);
    
    if (publishResults.errors.length > 0 && !publishResults.fb && !publishResults.ig) {
      return res.status(500).json({ error: 'Failed to publish: ' + publishResults.errors.join(', ') });
    }
    
    res.json({ success: true, postData, results: publishResults });
  } catch (error: any) {
    console.error('Error publishing post immediately:', error);
    res.status(500).json({ error: error.message || 'Failed to publish post immediately' });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const port = process.env.PORT || 3000;
  
  // Initialize Cron from saved config on startup
  const initialConfig = await getBotConfig();
  setupCronJob(initialConfig);

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.use('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

startServer();
