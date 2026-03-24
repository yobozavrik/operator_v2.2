#!/usr/bin/env node

process.env.SCOUT_MODE = 'live';
process.env.SCOUT_AGENT_PROVIDER = 'openclaw-local';

require('./instagram-scout-agent.js');
