#!/usr/bin/env node
// Script to query Sports Odds API for Arsenal's next Premier League match odds

import { GatewayClient } from '../src/gateway/client.js';
import { payForQuery } from '../src/tools/payForQuery.js';
import { getPublisherDetails } from '../src/tools/getPublisherDetails.js';
import { PrivateKeyWalletProvider } from '../src/wallet/privatekey.js';
import { config } from '../src/config/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  try {
    // Initialize gateway client
    const gateway = new GatewayClient();
    
    // Publisher ID for Sports Odds
    const publisherId = 'ffa2f05f-7481-4534-b47b-cf67501df20c';
    
    console.log('🔍 Getting publisher details...');
    const publisherDetails = await getPublisherDetails(
      { publisher_id: publisherId },
      gateway
    );

    if (!publisherDetails.success || !publisherDetails.publisher) {
      throw new Error('Failed to get publisher details: ' + publisherDetails.error);
    }

    console.log(`✅ Found publisher: ${publisherDetails.publisher.name} (${publisherDetails.publisher.id})`);
    console.log(`   Type: ${publisherDetails.publisher.publisherType}`);
    console.log(`   Description: ${publisherDetails.publisher.resourceDescription || 'N/A'}`);

    // Check if this is an API type publisher
    if (publisherDetails.publisher.publisherType !== 'api' && publisherDetails.publisher.publisherType !== 'both') {
      console.error('❌ This publisher is not an API type. Use query_database tool for database-type publishers.');
      process.exit(1);
    }

    // Step 2: Initialize wallet
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('WALLET_PRIVATE_KEY environment variable is required');
    }

    // Verify private key is loaded (show first/last few chars for security)
    const keyPreview = privateKey.length > 10 
      ? `${privateKey.substring(0, 6)}...${privateKey.substring(privateKey.length - 4)}`
      : '***';
    console.log(`🔑 Using WALLET_PRIVATE_KEY from environment: ${keyPreview}`);

    const wallet = new PrivateKeyWalletProvider();
    await wallet.connect(privateKey);
    const walletAddress = await wallet.getAddress();
    console.log(`✅ Wallet connected: ${walletAddress}`);

    // Step 3: Query API endpoints to find Arsenal's Premier League odds
    console.log('\n📊 Querying Sports Odds API for Arsenal\'s Premier League match odds...');
    
    // Step 3.1: Get available sports
    console.log('\n🔍 Step 1: Getting available sports...');
    const sportsResult = await payForQuery(
      {
        publisher_id: publisherId,
        request: {
          method: 'GET',
          path: '/sports',
        },
      },
      wallet,
      gateway
    );

    if (!sportsResult.success) {
      console.error(`❌ Failed to get sports list: ${sportsResult.error}`);
      process.exit(1);
    }

    console.log('✅ Available sports retrieved');
    const sports = sportsResult.data as any;
    console.log(`📋 Sports data: ${JSON.stringify(sports, null, 2).substring(0, 200)}...`);

    // Step 3.2: Try to find soccer/football sport and get events
    // Common sport identifiers: 'soccer', 'football', 'soccerfootball', etc.
    const sportIdentifiers = ['soccer', 'football', 'soccerfootball', 'premier-league'];
    let sportFound = false;
    let eventsResult: any = null;
    let sportId = '';

    for (const sportIdCandidate of sportIdentifiers) {
      console.log(`\n🔍 Step 2: Trying to get events for sport: ${sportIdCandidate}...`);
      eventsResult = await payForQuery(
        {
          publisher_id: publisherId,
          request: {
            method: 'GET',
            path: `/sports/${sportIdCandidate}/events`,
          },
        },
        wallet,
        gateway
      );

      if (eventsResult.success && eventsResult.data) {
        const events = eventsResult.data as any;
        const eventsArray = Array.isArray(events) ? events : (events.events || events.data || []);
        
        if (eventsArray.length > 0) {
          console.log(`✅ Found ${eventsArray.length} events for sport: ${sportIdCandidate}`);
          sportFound = true;
          sportId = sportIdCandidate;
          break;
        }
      } else {
        console.log(`⚠️  No events found for sport: ${sportIdCandidate}`);
      }
    }

    if (!sportFound || !eventsResult.success) {
      console.error('\n❌ Could not find events. Trying alternative approach...');
      // Try getting odds directly
      console.log('\n🔍 Step 2 (Alternative): Trying to get odds directly...');
      for (const sportIdCandidate of sportIdentifiers) {
        console.log(`\n🔍 Trying to get odds for sport: ${sportIdCandidate}...`);
        const oddsResult = await payForQuery(
          {
            publisher_id: publisherId,
            request: {
              method: 'GET',
              path: `/sports/${sportIdCandidate}/odds`,
            },
          },
          wallet,
          gateway
        );

        if (oddsResult.success && oddsResult.data) {
          const odds = oddsResult.data as any;
          const oddsArray = Array.isArray(odds) ? odds : (odds.odds || odds.data || []);
          
          // Filter for Arsenal
          const arsenalOdds = oddsArray.filter((item: any) => {
            const homeTeam = item.home_team || item.homeTeam || item.team1 || '';
            const awayTeam = item.away_team || item.awayTeam || item.team2 || '';
            const league = item.league || item.competition || item.tournament || '';
            return (
              (homeTeam.toLowerCase().includes('arsenal') || awayTeam.toLowerCase().includes('arsenal')) &&
              league.toLowerCase().includes('premier')
            );
          });

          if (arsenalOdds.length > 0) {
            console.log(`\n✅ Found Arsenal odds!`);
            console.log('📊 Arsenal\'s Premier League Odds:');
            console.log(JSON.stringify(arsenalOdds, null, 2));
            console.log(`\n💰 Cost: ${oddsResult.cost || 'N/A'} USDC`);
            if (oddsResult.txHash) {
              console.log(`🔗 Transaction hash: ${oddsResult.txHash}`);
            }
            return;
          }
        }
      }
      console.error('\n❌ Could not find Arsenal odds through any method.');
      process.exit(1);
    }

    // Step 3.3: Filter events for Arsenal in Premier League
    const events = eventsResult.data as any;
    const eventsArray = Array.isArray(events) ? events : (events.events || events.data || []);
    
    console.log(`\n🔍 Step 3: Filtering events for Arsenal in Premier League...`);
    const arsenalEvents = eventsArray.filter((event: any) => {
      const homeTeam = event.home_team || event.homeTeam || event.team1 || event.participants?.[0]?.name || '';
      const awayTeam = event.away_team || event.awayTeam || event.team2 || event.participants?.[1]?.name || '';
      const league = event.league || event.competition || event.tournament || event.sport || '';
      const eventName = event.name || event.title || '';
      
      const hasArsenal = 
        homeTeam.toLowerCase().includes('arsenal') || 
        awayTeam.toLowerCase().includes('arsenal') ||
        eventName.toLowerCase().includes('arsenal');
      
      const isPremierLeague = 
        league.toLowerCase().includes('premier') ||
        league.toLowerCase().includes('epl') ||
        eventName.toLowerCase().includes('premier');
      
      return hasArsenal && isPremierLeague;
    });

    if (arsenalEvents.length === 0) {
      console.log('⚠️  No Arsenal Premier League events found in events list.');
      console.log(`📋 Showing first few events for reference:`);
      console.log(JSON.stringify(eventsArray.slice(0, 3), null, 2));
      process.exit(1);
    }

    console.log(`✅ Found ${arsenalEvents.length} Arsenal Premier League event(s)`);
    
    // Step 3.4: Get odds for the first Arsenal event
    const firstEvent = arsenalEvents[0];
    const eventId = firstEvent.id || firstEvent.eventId || firstEvent.event_id;
    
    if (!eventId) {
      console.error('❌ Event ID not found in event data');
      console.log('Event data:', JSON.stringify(firstEvent, null, 2));
      process.exit(1);
    }

    console.log(`\n🔍 Step 4: Getting odds for event ID: ${eventId}...`);
    const oddsResult = await payForQuery(
      {
        publisher_id: publisherId,
        request: {
          method: 'GET',
          path: `/sports/${sportId}/events/${eventId}/odds`,
        },
      },
      wallet,
      gateway
    );

    if (!oddsResult.success) {
      console.error(`❌ Failed to get odds: ${oddsResult.error}`);
      // Try alternative endpoint
      console.log('\n🔍 Trying alternative: Getting odds from /sports/:sport/odds...');
      const altOddsResult = await payForQuery(
        {
          publisher_id: publisherId,
          request: {
            method: 'GET',
            path: `/sports/${sportId}/odds`,
          },
        },
        wallet,
        gateway
      );

      if (altOddsResult.success) {
        const allOdds = altOddsResult.data as any;
        const oddsArray = Array.isArray(allOdds) ? allOdds : (allOdds.odds || allOdds.data || []);
        const eventOdds = oddsArray.filter((odd: any) => 
          (odd.eventId === eventId || odd.event_id === eventId)
        );
        
        if (eventOdds.length > 0) {
          console.log('\n✅ Found odds via alternative endpoint!');
          console.log('📊 Arsenal\'s Premier League Match & Odds:');
          console.log('Event:', JSON.stringify(firstEvent, null, 2));
          console.log('Odds:', JSON.stringify(eventOdds, null, 2));
          console.log(`\n💰 Cost: ${altOddsResult.cost || 'N/A'} USDC`);
          if (altOddsResult.txHash) {
            console.log(`🔗 Transaction hash: ${altOddsResult.txHash}`);
          }
          return;
        }
      }
      process.exit(1);
    }

    // Success!
    console.log('\n✅ Successfully retrieved Arsenal odds!');
    console.log('📊 Arsenal\'s Premier League Match & Odds:');
    console.log('Event:', JSON.stringify(firstEvent, null, 2));
    console.log('Odds:', JSON.stringify(oddsResult.data, null, 2));
    console.log(`\n💰 Cost: ${oddsResult.cost || 'N/A'} USDC`);
    if (oddsResult.txHash) {
      console.log(`🔗 Transaction hash: ${oddsResult.txHash}`);
    }
  } catch (error) {
    console.error('❌ Unexpected error occurred:');
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      if (error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
      // Log any additional error properties
      const errorAny = error as any;
      if (errorAny.statusCode || errorAny.statusText || errorAny.errorBody) {
        console.error('\nAdditional error details:');
        if (errorAny.statusCode) {
          console.error(`  HTTP Status: ${errorAny.statusCode} ${errorAny.statusText || ''}`.trim());
        }
        if (errorAny.errorBody) {
          console.error(`  Error Body: ${JSON.stringify(errorAny.errorBody, null, 2)}`);
        }
      }
    } else {
      console.error('Error:', error);
    }
    process.exit(1);
  }
}

main();

