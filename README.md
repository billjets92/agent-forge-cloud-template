# Agent Forge: your own cloud assistant (preview)

A small Cloudflare Worker runs short summaries, drafts and plans in **your own Cloudflare account**, even while your browser is closed and laptop is asleep. It is a starter assistant, not a host for uploaded Python teams or an always-on uptime guarantee.

[Deploy to your Cloudflare account](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fbilljets92%2Fagent-forge-cloud-template)

## Browser setup

1. In Agent Forge, choose **Cloud account**, create a cloud world and copy its private setup value. It expires in 30 minutes; generate a new value if it expires.
2. Use the Deploy to Cloudflare link supplied by Forge. Sign in to **your own** Cloudflare and GitHub accounts. Choose **Workers Free**. Do not add payment, upgrade or use someone else's account. If deployment asks for a paid plan, stop.
3. In deployment settings, paste the setup value into the **FORGE_SETUP secret**. Set **FREE_PLAN_ONLY** to `confirmed` only after checking your Workers plan is Free. Keep the AI and DB bindings. Deploy.
If the deployment screen does not offer these values, open your Worker → Settings → Variables and Secrets after deployment, add them there and deploy the changes. No agent work runs before confirmation and pairing.

4. Return to Forge and wait for Connected. A new Cloudflare schedule can take up to 15 minutes to activate. Then choose Summarize notes, Improve a draft, or Make a plan from your world. Paste source notes or a draft; plans require a goal. Extra direction is optional. Your laptop can close after Forge confirms the task was queued.

If GitHub authorization returns to a generic repository picker, reopen the Deploy link from Forge to restore this template form. Choose a private repository and leave Preview builds off. If the setup value expires during signup, generate a fresh value and replace the secret in the same Worker.

Cloudflare may ask to copy this template into your GitHub account and authorize its build app. Review those permissions yourself. No terminal is required for the deploy-button path.

## What stops usage

- Five task attempts per UTC day per installation, with an atomic counter in customer D1 storage. Failed/uncertain model calls consume an attempt.
- One model call per task, fixed `@cf/meta/llama-3.2-3b-instruct`, 6,000 input bytes and 512 output tokens. No tools, arbitrary URLs, shell execution, external model API keys, AI Gateway or paid fallback.
- No automatic retries of model calls. Duplicate run IDs cannot reserve another attempt.
- An additional five-launch daily limit is enforced by Forge for each cloud world.
- Scheduled checks run once per minute. Model calls happen only for authenticated tasks in the paired world. There is no public inference endpoint.
- Cloudflare's **Free plan** provides account-wide usage enforcement. If it rejects a request, the task fails without paid fallback.

**The confirmation setting is an acknowledgement, not a billing API check.** This template cannot inspect or lock your account plan, stop other apps using your allowance, or prevent you changing the code or upgrading your account. Stay on Workers Free. A paid account can incur charges under its own billing rules. No setup can promise that third-party pricing will never change.

Nothing in this template can access the Forge host's provider keys or Cloudflare account. All AI and D1 bindings belong to the account where you deploy. Agent Forge does not deploy it into the host's account or supply AI credits.

## Privacy and control

The scoped runtime credential lives in your private D1 database. The one-use setup value belongs in a Worker secret, never a URL, public repository, task prompt or support message. Prompts go from Forge to your Worker and Cloudflare AI; results and progress return to your private Forge world. Cloudflare processes that content under its policies.

Use **Disconnect runtime** in Forge to revoke access. Delete the Worker or remove its schedule in your own Cloudflare dashboard to stop checks. A model call already in flight may finish and consume your allowance. Interrupted work is not resumed or replayed. Your report stays in Forge if completion was recorded.

To repair an expired or revoked connection, generate a new cloud setup value in Forge, replace FORGE_SETUP in the same Worker and redeploy. Keep the same D1 binding so daily limits survive redeployment. Do not deploy multiple copies to evade allowances.

## Better briefs and useful drafts

Supply the facts you want the assistant to use. Summaries and reviews require source material in the site; plans require a goal and label assumptions. The worker instructs the model to preserve names, dates and numbers, distinguish facts from suggestions, and identify missing information. It includes a small set of established Forge interface facts and uses a low sampling temperature. These instructions reduce opportunities for invention; they do not guarantee factual accuracy.

The world labels completion **Draft ready**. **Review draft** opens the result with the original task and notes available for comparison. Nothing is published or acted upon automatically. The worker still uses one call, 512 output tokens and the same free limits. Already-deployed copies need their owner to update their Worker to receive these prompt changes; updating the template does not silently update customer accounts.

## Validation status

Local automated checks cover durable SQL limits, concurrent/duplicate reservations, single model invocation, failure redaction, cancellation, pairing and Forge access boundaries. The AI binding is mocked during tests, so no owner credits are used. One controlled Workers Free deployment completed a real Llama 3.2 3B task on 2026-10-23 UTC: queued, claimed, agent.started, agent.completed and retained report. The isolated connection was then revoked. This verifies one account and one run, not production reliability. The model invented UI details and timings in its draft; review all output and use supplied source material for summaries. No browsing or external actions are available.

Official references: [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/), [Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

The source-first prompt revision is covered by local mocked-binding tests and browser checks. It has not had an additional real-model evaluation; the previous single real run is the only approved inference so far.
