import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import cron from 'node-cron';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

// Use a type alias for config if desired, or handle inside getBotConfig

dotenv.config();

// Helper function to prevent cut-off sentences
function getFullSentences(text: string, maxLen: number = 400): string {
  if (!text) return '';
  let cleanText = text.replace(/<[^>]*>?/gm, '').replace(/\n/g, ' ').trim();
  if (cleanText.length <= maxLen) return cleanText;
  
  // Use regex to find complete sentences
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const sentences = cleanText.match(sentenceRegex);
  
  // If no punctuation exists, safely truncate at the last word
  if (!sentences) {
    const cut = cleanText.substring(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return lastSpace > 0 ? cut.substring(0, lastSpace) + '...' : cut + '...';
  }
  
  let result = '';
  for (const sentence of sentences) {
    // If we already have text and adding this sentence makes it way too long, stop.
    if (result.length > 0 && result.length + sentence.length > maxLen + 50) {
      break;
    }
    result += sentence;
    if (result.length >= maxLen) {
      break;
    }
  }
  
  // If the very first sentence is monstrously long, truncate it safely
  if (result.length > maxLen + 150) {
    const cut = result.substring(0, maxLen);
    const lastSpace = cut.lastIndexOf(' ');
    return lastSpace > 0 ? cut.substring(0, lastSpace) + '...' : cut + '...';
  }
  
  return result.trim();
}


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
    
    // Override with Environment Variables (Useful for Render/Cloud Deployments)
    if (process.env.MAKE_WEBHOOK_URL) parsed.makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (process.env.FB_PAGE_ID) parsed.fbPageId = process.env.FB_PAGE_ID;
    if (process.env.IG_USER_ID) parsed.igUserId = process.env.IG_USER_ID;
    if (process.env.META_ACCESS_TOKEN) parsed.accessToken = process.env.META_ACCESS_TOKEN;
    if (process.env.BOT_IS_ACTIVE === 'true') parsed.isActive = true;
    if (process.env.BOT_SCHEDULE_TIMES) {
      parsed.scheduleTimes = process.env.BOT_SCHEDULE_TIMES.split(',');
    }
    
    return parsed;
  } catch (error) {
    const defaultSecret = process.env.WEBHOOK_SECRET || crypto.randomBytes(16).toString('hex');
    return { 
      isActive: process.env.AUTO_POST_ACTIVE === 'true' || process.env.BOT_IS_ACTIVE === 'true' || false, 
      scheduleTimes: process.env.SCHEDULE_TIMES ? process.env.SCHEDULE_TIMES.split(',') : (process.env.BOT_SCHEDULE_TIMES ? process.env.BOT_SCHEDULE_TIMES.split(',') : ['09:00']), 
      fbPageId: process.env.FB_PAGE_ID || '', 
      igUserId: process.env.IG_USER_ID || '', 
      accessToken: process.env.FB_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '', 
      timezone: process.env.TIMEZONE || 'UTC',
      makeWebhookUrl: process.env.MAKE_WEBHOOK_URL || '',
      webhookSecret: defaultSecret 
    };
  }
}

async function saveBotConfig(config: any) {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

const HISTORY_FILE = path.join(process.cwd(), 'post-history.json');

async function getPostHistory(): Promise<string[]> {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveToHistory(id: string) {
  try {
    const history = await getPostHistory();
    if (!history.includes(id)) {
      history.push(id);
      // Keep a massive history to ensure no duplicates for a very long time
      if (history.length > 5000) history.shift();
      await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('Error saving to history:', error);
  }
}

// Fetch recent posts to avoid duplicates (Fallback for when history file resets)
async function getRecentFacebookPosts(fbPageId: string, accessToken: string): Promise<string[]> {
  try {
    if (!fbPageId || !accessToken) return [];
    const url = `https://graph.facebook.com/v19.0/${fbPageId}/posts?limit=15&access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.data && Array.isArray(data.data)) {
      return data.data.map((post: any) => post.message).filter(Boolean);
    }
  } catch (err) {
    console.error('Error fetching recent FB posts:', err);
  }
  return [];
}

// Local Library (No API Required) - Fallback content covering diverse categories
const FITNESS_LIBRARY = [
  {
    category: "Science",
    fact: "Muscle memory is real: Myonuclei gained during training remain even after you stop training, making it easier to regain lost muscle.",
    caption: "Don't stress if you took a break! Your muscles remember. 🧠💪 Get back in the gym and watch how fast you bounce back!",
    hashtags: "#FitnessFacts #MuscleMemory #GymMotivation #Comeback",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/20713720/",
    image_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Science",
    fact: "Lifting weights can improve your sleep quality. Studies show resistance training can help you fall asleep faster and sleep deeper.",
    caption: "Struggling to catch some Zzz's? Pick up some heavy weights! 🏋️‍♀️💤 A good workout is the best sleep aid.",
    hashtags: "#SleepBetter #WeightLifting #GymLife #FitnessTips",
    comment_source: "https://www.sleepfoundation.org/physical-activity/weight-training-and-sleep",
    image_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Diet",
    fact: "Drinking enough water can boost your metabolic rate by up to 30% for about an hour.",
    caption: "Stay hydrated! 💧 It's not just about performance, it's about keeping your metabolism firing all day long. Drink up!",
    hashtags: "#Hydration #Metabolism #FitnessFuel #HealthyLifestyle",
    comment_source: "https://www.healthline.com/nutrition/7-health-benefits-of-water",
    image_url: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Training Methods",
    fact: "Compound exercises (like squats and deadlifts) trigger a higher hormonal response (testosterone and growth hormone) than isolation exercises.",
    caption: "Want to grow? Stick to the basics! 📈 Compound lifts are the secret to unlocking your true potential.",
    hashtags: "#CompoundLifts #Squats #Deadlifts #MuscleGrowth",
    comment_source: "https://examine.com/articles/does-working-out-boost-testosterone/",
    image_url: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Diet",
    fact: "Protein timing isn't as strict as we once thought. The 'anabolic window' lasts several hours, not just 30 minutes after your workout.",
    caption: "Take your time, enjoy your post-workout meal! 🥩 The '30-minute anabolic window' is a myth. Total daily protein matters most.",
    hashtags: "#NutritionFacts #Protein #GymMyths #FitnessScience",
    comment_source: "https://jissn.biomedcentral.com/articles/10.1186/1550-2783-10-5",
    image_url: "https://images.unsplash.com/photo-1579722820308-d74e571900a9?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Training Methods",
    fact: "Active recovery (like light walking or cycling) clears blood lactate faster than complete rest after intense exercise.",
    caption: "Sore from yesterday? Don't just sit on the couch! 🚶‍♂️ Light movement speeds up recovery so you can hit it hard again.",
    hashtags: "#ActiveRecovery #FitnessTips #GymLife #Recovery",
    comment_source: "https://www.health.harvard.edu/exercise-and-fitness/the-role-of-active-recovery",
    image_url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Motivation",
    fact: "Consistency beats intensity. Research shows working out moderately 4-5 times a week yields better long-term heart health and habit formation than going all-out just once a week.",
    caption: "It's a marathon, not a sprint. 🏃‍♀️ Show up, do the work, and stay consistent. That's where the magic happens!",
    hashtags: "#Consistency #FitnessJourney #WorkoutMotivation",
    comment_source: "https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/fitness/art-20048269",
    image_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Supplements",
    fact: "Creatine monohydrate is one of the most researched and safest supplements available, proven to increase strength, power output, and muscle mass.",
    caption: "Looking for an edge? Creatine is the real deal. 🚀 Fully backed by science for strength and power gains!",
    hashtags: "#Supplements #Creatine #StrengthGains #ScienceBacked",
    comment_source: "https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0173-z",
    image_url: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Supplements",
    fact: "Caffeine before a workout doesn't just wake you up; it reduces your perceived exertion, meaning heavy weights literally feel lighter.",
    caption: "Pre-workout power! ☕ Caffeine is scientifically proven to make your workouts feel easier so you can push harder.",
    hashtags: "#PreWorkout #Caffeine #GymHacks #PerformanceBoost",
    comment_source: "https://pubmed.ncbi.nlm.nih.gov/27474846/",
    image_url: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Expert Suggestion",
    fact: "Always prioritize form over weight. Ego lifting is the fastest path to an injury that could set your progress back by months.",
    caption: "Leave your ego at the door! 🚪 Perfecting your form leads to better muscle activation and keeps you injury-free.",
    hashtags: "#FormCheck #GymAdvice #InjuryPrevention #SmartTraining",
    comment_source: "Certified Personal Trainer Consensus",
    image_url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Diet",
    fact: "Your body needs carbohydrates to replenish glycogen stores after an intense workout. Don't fear the carbs!",
    caption: "Carbs are your friend! 🍚🍞 Replenishing your energy stores is crucial for recovery and tomorrow's performance.",
    hashtags: "#Nutrition #Carbs #PostWorkout #HealthyDiet",
    comment_source: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6019055/",
    image_url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?q=80&w=1080&auto=format&fit=crop"
  },
  {
    category: "Training Methods",
    fact: "Progressive Overload is the fundamental law of muscle growth. You must continually increase weight, reps, or volume over time.",
    caption: "If it doesn't challenge you, it doesn't change you! 📊 Keep tracking your lifts and pushing for that extra rep or pound.",
    hashtags: "#ProgressiveOverload #MuscleBuilding #TrainingTips",
    comment_source: "https://www.nsca.com/education/articles/kinetic-select/progressive-overload/",
    image_url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1080&auto=format&fit=crop"
  }
];

async function fetchFromReddit(): Promise<any> {
  const redditSources = [
    { sub: 'Fitness', cat: 'Community Insight' },
    { sub: 'nutrition', cat: 'Diet' },
    { sub: 'diet', cat: 'Diet' },
    { sub: 'Supplements', cat: 'Supplements' },
    { sub: 'bodyweightfitness', cat: 'Training Methods' },
    { sub: 'weightlifting', cat: 'Training Methods' },
    { sub: 'AdvancedFitness', cat: 'Science' },
    { sub: 'yoga', cat: 'Yoga & Mobility' },
    { sub: 'crossfit', cat: 'CrossFit' },
    { sub: 'powerlifting', cat: 'Strength & Power' },
    { sub: 'bodybuilding', cat: 'Bodybuilding' },
    { sub: 'flexibility', cat: 'Yoga & Mobility' },
    { sub: 'running', cat: 'Cardio & Endurance' },
    { sub: 'fasting', cat: 'Diet & Fasting' },
    { sub: 'HIIT', cat: 'Cardio & Endurance' },
    { sub: 'sleep', cat: 'Recovery & Wellness' },
    { sub: 'triathlon', cat: 'Cardio & Endurance' },
    { sub: 'kettlebell', cat: 'Strength & Power' },
    { sub: 'homefitness', cat: 'Home Workouts' },
    { sub: 'martialarts', cat: 'Martial Arts' },
    { sub: 'amateur_boxing', cat: 'Martial Arts' },
    { sub: 'pilates', cat: 'Yoga & Mobility' },
    { sub: 'mentalhealth', cat: 'Recovery & Wellness' },
    { sub: 'longevity', cat: 'Science' }
  ];
  
  const randomSource = redditSources[Math.floor(Math.random() * redditSources.length)];
  const randomSub = randomSource.sub;
  
  const sorts = ['hot', 'new', 'top', 'rising'];
  const randomSort = sorts[Math.floor(Math.random() * sorts.length)];
  const timeQuery = randomSort === 'top' ? '&t=all' : '';
  
  const response = await fetch(`https://www.reddit.com/r/${randomSub}/${randomSort}.json?limit=100${timeQuery}`, {
    headers: { 'User-Agent': 'DailyGymFactBot/2.0' }
  });
  const data = await response.json();
  const history = await getPostHistory();
  
  if (data?.data?.children) {
    // Shuffle the results to get varied posts
    const posts = data.data.children.sort(() => Math.random() - 0.5);
    for (const child of posts) {
      const post = child.data;
      const postId = `reddit_${post.id}`;
      
      // We only want text posts that have a decent title and aren't 18+
      if (!history.includes(postId) && !post.over_18 && post.title.length > 15) {
        return {
          id: postId,
          category: randomSource.cat,
          fact: post.title,
          caption: `Insights from the community! 💪\n\n${post.selftext ? getFullSentences(post.selftext, 300) : ''}`,
          hashtags: `#${randomSub} #FitnessJourney #GymTips`,
          comment_source: `https://reddit.com${post.permalink}`
        };
      }
    }
  }
  return null;
}

async function fetchFromWger(): Promise<any> {
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
          const cleanDesc = getFullSentences(ex.description, 250);
          return {
            id: exId,
            category: "Training Methods",
            fact: `Exercise Spotlight: ${ex.name}`,
            caption: `Looking to mix up your routine? Try the ${ex.name}!\n\n${cleanDesc}\n\nTarget Muscles: ${ex.category?.name || 'Full Body'}. Let's get to work! 💪🏋️‍♂️`,
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

async function fetchFromZenQuotes(): Promise<any> {
  const response = await fetch('https://zenquotes.io/api/random');
  const data = await response.json();
  const history = await getPostHistory();
  
  if (data && data.length > 0) {
    const quote = data[0];
    const quoteId = `quote_${Buffer.from(quote.q.substring(0, 15)).toString('base64')}`;
    
    if (!history.includes(quoteId)) {
      return {
          id: quoteId,
          category: "Motivation",
          fact: `"${quote.q}"\n- ${quote.a}`,
          caption: "Stay motivated and keep pushing forward! 💯🔥 Mindset is everything when it comes to hitting your goals.",
          hashtags: "#Motivation #FitnessMindset #KeepGoing #GymMotivation",
          comment_source: "https://zenquotes.io/"
      };
    }
  }
  return null;
}

async function fetchFromHealthNews(): Promise<any> {
  // Using rss2json public api for ScienceDaily Health/Fitness feed
  const response = await fetch('https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.sciencedaily.com%2Frss%2Fhealth_medicine%2Ffitness.xml');
  const data = await response.json();
  const history = await getPostHistory();
  
  if (data.status === 'ok' && data.items) {
    const items = data.items.sort(() => Math.random() - 0.5);
    for (const item of items) {
      const newsId = `news_${Buffer.from(item.guid || item.title).toString('base64').substring(0, 20)}`;
      if (!history.includes(newsId)) {
        return {
          id: newsId,
          category: "Science",
          fact: `New Fitness Study: ${item.title}`,
          caption: `Did you know? 🤔 \n${item.description ? getFullSentences(item.description, 250) : 'Fascinating new fitness research just dropped!'}\n\nStay informed and keep growing! 📚💪`,
          hashtags: "#FitnessScience #HealthNews #FitnessResearch",
          comment_source: item.link
        }
      }
    }
  }
  return null;
}

async function fetchFromWikipedia(): Promise<any> {
  const topics = [
    'Muscle hypertrophy', 'Nutrition', 'Kettlebell', 'Yoga', 'Pilates',
    'Deadlift', 'Squat (exercise)', 'Metabolism', 'Endurance training',
    'High-intensity interval training', 'Plyometrics', 'Calisthenics',
    'Delayed onset muscle soreness', 'Creatine', 'VO2 max', 'Biomechanics',
    'Stretching', 'Core stability', 'Protein (nutrient)', 'Physical fitness',
    'Aerobic exercise', 'Anaerobic exercise', 'Sleep and metabolism', 
    'Cold-water immersion', 'Sports biomechanics', 'Kinesiology', 
    'Human anatomy', 'Sauna', 'Fasting', 'Intermittent fasting',
    'Exercise physiology', 'Sports psychology', 'Meditation'
  ];
  
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];
  
  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(randomTopic)}`);
    const data = await response.json();
    const history = await getPostHistory();
    
    if (data && data.query && data.query.pages) {
      const pages = Object.values(data.query.pages);
      if (pages.length > 0) {
        const page = pages[0] as any;
        const pageId = `wiki_${page.pageid}`;
        
        if (!history.includes(pageId) && page.extract) {
          const cleanExtract = getFullSentences(page.extract, 300);
          return {
            id: pageId,
            category: "History & Facts",
            fact: `Fitness Fact: ${randomTopic}`,
            caption: `Did you know? 🧠\n\n${cleanExtract}\n\nNever stop learning about your body and training! 📖💪`,
            hashtags: `#${randomTopic.replace(/[^a-zA-Z0-9]/g, '')} #FitnessFacts #GymKnowledge #Learn`,
            comment_source: `https://en.wikipedia.org/wiki/${encodeURIComponent(randomTopic)}`
          };
        }
      }
    }
  } catch (err) {
    console.error("Error fetching from Wikipedia", err);
  }
  return null;
}

async function fetchFromMealDB(): Promise<any> {
  const categories = ['Chicken', 'Seafood', 'Vegan', 'Vegetarian', 'Breakfast'];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  
  try {
    const response = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${randomCategory}`);
    const data = await response.json();
    const history = await getPostHistory();
    
    if (data && data.meals && data.meals.length > 0) {
      const meals = data.meals.sort(() => Math.random() - 0.5);
      
      for (const meal of meals) {
        const mealId = `mealdb_${meal.idMeal}`;
        if (!history.includes(mealId)) {
          // Fetch full recipe details
          const detailRes = await fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`);
          const detailData = await detailRes.json();
          if (detailData && detailData.meals && detailData.meals.length > 0) {
            const recipe = detailData.meals[0];
            const cleanInstructions = recipe.strInstructions ? getFullSentences(recipe.strInstructions, 300) : 'Check the link for full recipe!';
            
            return {
              id: mealId,
              category: "Healthy Recipes",
              fact: `Recipe Idea: ${recipe.strMeal}`,
              caption: `Fuel your body right! 🥗🍗\n\nTry making ${recipe.strMeal} for your next meal.\n\n${cleanInstructions}\n\nEat well to train well! 🧑‍🍳🍽️`,
              hashtags: `#HealthyEating #${randomCategory} #FitnessFood #MealPrep`,
              comment_source: recipe.strSource || `https://www.themealdb.com/meal.php?c=${meal.idMeal}`
            };
          }
        }
      }
    }
  } catch (err) {
    console.error("Error fetching from MealDB", err);
  }
  return null;
}

// Main Content generator orchestrator
async function generateAiPostData(config?: any): Promise<any> {
  const history = await getPostHistory();
  
  // List of our dynamic source functions
  const sources = [fetchFromReddit, fetchFromHealthNews, fetchFromZenQuotes, fetchFromWger, fetchFromWikipedia, fetchFromMealDB];
  
  // Shuffle the order of APIs so the content type changes randomly every time
  sources.sort(() => Math.random() - 0.5);
  
  let postData = null;
  for (const sourceFn of sources) {
    try {
      postData = await sourceFn();
      if (postData) break; // Found unique content!
    } catch (err) {
      console.error(`Source fetch failed, trying next...`);
    }
  }
  
  // 3. Fallback to our offline local library if all APIs fail or have been exhausted
  if (!postData) {
    console.log("All APIs failed or returned duplicate content. Falling back to local library.");
    let availableFacts = FITNESS_LIBRARY.filter(item => {
      const fallbackId = `fallback_${Buffer.from(item.fact.substring(0, 15)).toString('base64')}`;
      return !history.includes(fallbackId);
    });
    
    if (availableFacts.length === 0) {
       console.log("All fallback facts used! Resetting local pool.");
       availableFacts = [...FITNESS_LIBRARY];
    }
    
    const randomIndex = Math.floor(Math.random() * availableFacts.length);
    const selected = availableFacts[randomIndex];
    postData = {
      id: `fallback_${Buffer.from(selected.fact.substring(0, 15)).toString('base64')}`,
      ...selected
    };
  }
  
  // Attach a high-quality curated image based on category
  const curatedImages: Record<string, string[]> = {
    "Strength & Power": [
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48",
      "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5",
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e",
      "https://images.unsplash.com/photo-1507398941214-572c25f4b1dc",
      "https://images.unsplash.com/photo-1526506114642-4f323a6f1165",
      "https://images.unsplash.com/photo-1517963879433-6ad2b056d712",
      "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61",
      "https://images.unsplash.com/photo-1574680088814-c9e8a10d8a4d"
    ],
    "Bodybuilding": [
      "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b",
      "https://images.unsplash.com/photo-1558611848-73f7eb4001a1",
      "https://images.unsplash.com/photo-1517838277536-f5f99be501cd",
      "https://images.unsplash.com/photo-1574680096145-d05b474e2155",
      "https://images.unsplash.com/photo-1528360983277-13d401cdc186",
      "https://images.unsplash.com/photo-1605296867304-46d5465a13f1"
    ],
    "Yoga & Mobility": [
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b",
      "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0",
      "https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b",
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773",
      "https://images.unsplash.com/photo-1518611012118-696072aa579a",
      "https://images.unsplash.com/photo-1552196563-552592596167",
      "https://images.unsplash.com/photo-1603988363607-e1e4a66962c6"
    ],
    "Cardio & Endurance": [
      "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8",
      "https://images.unsplash.com/photo-1552674605-db6ffd4facb5",
      "https://images.unsplash.com/photo-1513593771513-7b58b6c4af38",
      "https://images.unsplash.com/photo-1530143311094-34d807799e8f",
      "https://images.unsplash.com/photo-1461896836934-ffe145ab64c1",
      "https://images.unsplash.com/photo-1502224562085-639556652f33",
      "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc"
    ],
    "Diet": [
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061",
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd",
      "https://images.unsplash.com/photo-1498837167922-41c46b21c620",
      "https://images.unsplash.com/photo-1493770348161-369560ae357d",
      "https://images.unsplash.com/photo-1505253758473-96b7015fcd40",
      "https://images.unsplash.com/photo-1478144596228-3e499e327663"
    ],
    "Healthy Recipes": [
      "https://images.unsplash.com/photo-1482049016688-2d3e1b311543",
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836",
      "https://images.unsplash.com/photo-1490645935967-10de6ba17061",
      "https://images.unsplash.com/photo-1473093295043-cdd812d0e601",
      "https://images.unsplash.com/photo-1498837167922-41c46b21c620",
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c",
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd",
      "https://images.unsplash.com/photo-1505253758473-96b7015fcd40",
      "https://images.unsplash.com/photo-1493770348161-369560ae357d"
    ],
    "Recovery & Wellness": [
      "https://images.unsplash.com/photo-1541892079-2475b1212bc0",
      "https://images.unsplash.com/photo-1515023115689-589c33041d3c",
      "https://images.unsplash.com/photo-1531259683007-016a7b628fc3",
      "https://images.unsplash.com/photo-1512438248247-f0f2a5a8b7f0",
      "https://images.unsplash.com/photo-1521714161819-15534968fc5f",
      "https://images.unsplash.com/photo-1511295742362-92c96b1cf484",
      "https://images.unsplash.com/photo-1517436073-3b1b1519fca9",
      "https://images.unsplash.com/photo-1506126613408-eca07ce68773",
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b"
    ],
    "Home Workouts": [
      "https://images.unsplash.com/photo-1518611012118-696072aa579a",
      "https://images.unsplash.com/photo-1598289431512-b97b0917affc",
      "https://images.unsplash.com/photo-1576678927484-cc907957088c",
      "https://images.unsplash.com/photo-1513593771513-7b58b6c4af38",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b",
      "https://images.unsplash.com/photo-1599058917212-d750089bc07e",
      "https://images.unsplash.com/photo-1599058918144-1ffabb6ab9a0"
    ],
    "Martial Arts": [
      "https://images.unsplash.com/photo-1555597673-b21d5c935865",
      "https://images.unsplash.com/photo-1591117207239-788bf8de6c3b",
      "https://images.unsplash.com/photo-1599552611573-8b7762c2f822",
      "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61",
      "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5",
      "https://images.unsplash.com/photo-1555597673-b21d5c935865"
    ],
    "Science": [
      "https://images.unsplash.com/photo-1576086213369-97a306d36557",
      "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69",
      "https://images.unsplash.com/photo-1530026405186-ed1f139313f8",
      "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158",
      "https://images.unsplash.com/photo-1614935151651-0bea6508abb0",
      "https://images.unsplash.com/photo-1579684385127-1ef15d508118",
      "https://images.unsplash.com/photo-1532094349884-543bc11b234d"
    ],
    "Motivation": [
      "https://images.unsplash.com/photo-1552674605-db6ffd4facb5",
      "https://images.unsplash.com/photo-1507398941214-572c25f4b1dc",
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438",
      "https://images.unsplash.com/photo-1461896836934-ffe145ab64c1",
      "https://images.unsplash.com/photo-1526506114642-4f323a6f1165",
      "https://images.unsplash.com/photo-1517838277536-f5f99be501cd",
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48"
    ],
    "General": [
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438",
      "https://images.unsplash.com/photo-1579722820308-d74e571900a9",
      "https://images.unsplash.com/photo-1554244933-d876deb6b2ff",
      "https://images.unsplash.com/photo-1540497077202-7c8a3999166f",
      "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e",
      "https://images.unsplash.com/photo-1534438327276-14e5300c3a48",
      "https://images.unsplash.com/photo-1517963879433-6ad2b056d712",
      "https://images.unsplash.com/photo-1552674605-db6ffd4facb5",
      "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b",
      "https://images.unsplash.com/photo-1534438097544-b0a6493b821f"
    ]
  };

  // Map category to best image list
  let imageList = curatedImages["General"];
  const cat = postData.category || "";
  
  if (cat.includes("Strength") || cat.includes("CrossFit") || cat.includes("Training")) imageList = curatedImages["Strength & Power"];
  else if (cat.includes("Bodybuilding")) imageList = curatedImages["Bodybuilding"];
  else if (cat.includes("Yoga") || cat.includes("Mobility") || cat.includes("Pilates")) imageList = curatedImages["Yoga & Mobility"];
  else if (cat.includes("Cardio") || cat.includes("Endurance")) imageList = curatedImages["Cardio & Endurance"];
  else if (cat.includes("Diet") || cat.includes("Nutrition") || cat.includes("Fasting")) imageList = curatedImages["Diet"];
  else if (cat.includes("Recipe") || cat.includes("Meal")) imageList = curatedImages["Healthy Recipes"];
  else if (cat.includes("Recovery") || cat.includes("Wellness") || cat.includes("Sleep") || cat.includes("Mental")) imageList = curatedImages["Recovery & Wellness"];
  else if (cat.includes("Home Workouts") || cat.includes("Calisthenics")) imageList = curatedImages["Home Workouts"];
  else if (cat.includes("Martial Arts") || cat.includes("Boxing")) imageList = curatedImages["Martial Arts"];
  else if (cat.includes("Science") || cat.includes("Research") || cat.includes("Anatomy") || cat.includes("Physiology")) imageList = curatedImages["Science"];
  else if (cat.includes("Motivation") || cat.includes("Mindset")) imageList = curatedImages["Motivation"];

  // Filter out images we have already used
  let availableImages = imageList.filter(url => !history.includes(url));
  
  if (availableImages.length === 0) {
    console.log(`All images in category used. Falling back to General.`);
    availableImages = curatedImages["General"].filter(url => !history.includes(url));
  }
  
  if (availableImages.length === 0) {
    console.log(`All images used! Reusing from General pool.`);
    availableImages = curatedImages["General"]; 
  }

  // Pick random image from available list
  const baseImageUrl = availableImages[Math.floor(Math.random() * availableImages.length)];
  
  // Save the base image URL as image_id so we can mark it as used in history
  postData.image_id = baseImageUrl;
  postData.image_url = `${baseImageUrl}?ixlib=rb-4.0.3&q=80&fm=jpg&crop=faces&fit=crop&h=1080&w=1080`;
  
  return postData;
}

// Automated Posting Logic using Meta Graph API
async function publishToSocialMedia(postData: any, config: any) {
  const { fbPageId, igUserId, accessToken } = config;
  const imageUrl = postData.image_url;
  const fullCaption = `${postData.fact}\n\n${postData.caption}\n\n${postData.hashtags}`;

  console.log('Initiating automated post to social media...');
  const results = { fb: false, ig: false, errors: [] as string[] };

  // 1. Post to Facebook Page
  if (config.makeWebhookUrl) {
    try {
      console.log('Sending Facebook post to Make.com webhook bypass...');
      const webhookRes = await fetch(config.makeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          message: fullCaption,
          comment: `Source: ${postData.comment_source}`
        })
      });
      if (!webhookRes.ok) {
        throw new Error(`Webhook returned status ${webhookRes.status}`);
      }
      console.log('Successfully sent to Make.com webhook');
      results.fb = true;
    } catch (e: any) {
      console.error('Make.com webhook failed:', e.message);
      results.errors.push(`Facebook (Make.com): ${e.message}`);
    }
  } else if (fbPageId) {
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
        body: JSON.stringify({ 
          image_url: imageUrl, 
          caption: fullCaption, 
          media_type: 'IMAGE', // Force Meta to treat this as a static image
          access_token: accessToken 
        })
      });
      const igMediaData = await igMediaRes.json();
      if (igMediaData.error) throw new Error(igMediaData.error.message);
      
      console.log('Instagram media container created. Waiting 8 seconds for Meta to process the image...');
      // IMPORTANT: Meta downloads and processes the image asynchronously. 
      // If we publish immediately, it throws "Media ID is not available".
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      // Step B: Publish Media
      const igPublishRes = await fetch(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: igMediaData.id, access_token: accessToken })
      });
      const igPublishData = await igPublishRes.json();
      if (igPublishData.error) throw new Error(igPublishData.error.message);

      // Step C: Comment on Media
      const igCommentRes = await fetch(`https://graph.facebook.com/v19.0/${igPublishData.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Source: ${postData.comment_source}`, access_token: accessToken })
      });
      const igCommentData = await igCommentRes.json();
      if (igCommentData.error) {
        console.error('Instagram comment failed:', igCommentData.error.message);
      }
      
      console.log('Successfully posted to Instagram');
      results.ig = true;
    } catch (e: any) {
      console.error('Instagram posting failed:', e.message);
      results.errors.push(`Instagram: ${e.message}`);
    }
  }
  
  if ((results.fb || results.ig) && postData.id) {
    await saveToHistory(postData.id);
    if (postData.image_id) {
      await saveToHistory(postData.image_id);
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
        const tz = config.timezone || 'UTC';
        console.log(`Setting up daily auto-post cron for ${hour}:${minute} in timezone ${tz}`);
        
        const task = cron.schedule(cronExpression, async () => {
          console.log(`Cron triggered (${hour}:${minute} ${tz}): Generating and posting content...`);
          try {
            const postData = await generateAiPostData();
            const currentConfig = await getBotConfig(); // get freshest config
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

// Webhook endpoint for external Cron services (Keep-Alive)
app.get('/api/webhook/cron', async (req, res) => {
  try {
    const config = await getBotConfig();
    const providedSecret = req.query.secret;

    if (!config.webhookSecret || providedSecret !== config.webhookSecret) {
      return res.status(200).send('NO');
    }

    console.log('External Keep-Alive Webhook triggered. Server is awake.');
    
    // Return an extremely tiny response to prevent cron-job.org from complaining about "output too large"
    res.status(200).send('OK');
  } catch (error: any) {
    console.error('Webhook keep-alive failed:', error);
    res.status(200).send('ERR');
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
    if (!config.fbPageId && !config.igUserId && !config.makeWebhookUrl) {
      return res.status(400).json({ error: 'Please configure Facebook Page ID, Instagram Account ID, or a Make.com Webhook in Settings first.' });
    }
    if (!config.accessToken && !config.makeWebhookUrl) {
      return res.status(400).json({ error: 'Please configure Meta Access Token or Make.com Webhook in Settings first.' });
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
