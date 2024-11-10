//random v1.0

// Importing the crypto module for cryptographic operations
const crypto = require('crypto');

// Global boolean to control the use of random seeds
const debugMode = false;
const debugDelay = 5;
const serverSeed = generateRandomServerSeed(64);
const clientSeed = generateRandomClientSeed(10);
const startNonce = Math.floor(Math.random() * 1000000) + 1;
const startTime = Date.now();
let nonce = startNonce;

// Setting initial parameters for the simulation
let baseChance = 52,
    chance = baseChance,
    baseBet = 0.000063, //351K div, based on 10k balance
    nextBet = 0,  
    previousBet = 0,
    largestBetPlaced = baseBet,
    balance = 10000000000,
    startBalance = balance,
	lowestBalance = startBalance,
    totalBets = 86400000, // //240000 = 1 day, 1680000 = 1 week, 7200000 = 1 Month 86400000 = 1 year
    houseEdge = 1,
    payOut = ((100 - houseEdge) / (chance / 100) / 100),
    betHigh = true,
    win = false,
    profit = 0,
    roundProfit = 0,
    wager = 0,
    winCount = 0,
    winRatio = 0,
    betCount = 1,
    bethighCount = 0,
    maxBalanceDrawDown = 0,
    seedChangeAfterRolls = 5000, // seed change will only be activated at a win streak
	seedChangeAfterWins = 0,
	seedChangeAfterLosses = 0,
	seedChangeAfterWinStreak = 0,
	seedChangeAfterLossStreak = 0,
	seedChangeFlag = false,
    progress,
	cumLoss = 0,
	RP1LSSTART = 0,
	RP1LSEND = 0,
	RP1LS = 0,
	RP2LS = 0,
	previousChance = 0;

    let currentStreak = 0;
    let winStreak = 0;
    let maxStreak = 0;
    let maxStreakNonce = 0;
	
	const MIN_CHANCE = 0.75;
	const MAX_CHANCE = 98.00;

// Byte generator for cryptographic randomness
function* byteGenerator(serverSeed, clientSeed, nonce, cursor) {
    let currentRound = Math.floor(cursor / 32);
    let currentRoundCursor = cursor % 32;

    while (true) {
        const hmac = crypto.createHmac('sha256', serverSeed);
        hmac.update(`${clientSeed}:${nonce}:${currentRound}`);
        const buffer = hmac.digest();

        while (currentRoundCursor < 32) {
            yield buffer[currentRoundCursor];
            currentRoundCursor += 1;
        }

        currentRoundCursor = 0;
        currentRound += 1;
    }
}

// Utility function to introduce a delay
function betDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to simulate a dice roll using server and client seeds, nonce, and cursor
function getDiceRoll(serverSeed, clientSeed, nonce, cursor) {
    const rng = byteGenerator(serverSeed, clientSeed, nonce, cursor);
    const bytes = [];
    for (let i = 0; i < 4; i++) {
        bytes.push(rng.next().value);
    }

    const floatResult = bytes.reduce((acc, value, i) => acc + value / Math.pow(256, i + 1), 0);
    const roll = Math.floor(floatResult * 10001) / 100;
    return roll;
}

// Utility functions to generate random seeds
function generateRandomClientSeed(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}
function generateRandomServerSeed(length) {
    let result = [];
    const hexRef = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
    
    for (let n = 0; n < length; n++) {
        result.push(hexRef[Math.floor(Math.random() * 16)]);
    }
    
    return result.join('');
};

function checkResetSeed() {
    if (seedChangeAfterRolls && betCount % seedChangeAfterRolls === 0) {
        seedChangeFlag = true;
    } else if (win) {
        if (seedChangeAfterWins && winCount % seedChangeAfterWins === 0) {
            seedChangeFlag = true;
        } else if (seedChangeAfterWinStreak && currentStreak % seedChangeAfterWinStreak === 0) {
            seedChangeFlag = true;
        }
    } else {
        if (seedChangeAfterLosses && (betCount - winCount) % seedChangeAfterLosses === 0) {
            seedChangeFlag = true;
        } else if (seedChangeAfterLossStreak && currentStreak % seedChangeAfterLossStreak === 0) {           
			seedChangeFlag = true;
        }
    }
	if (seedChangeFlag === true && currentStreak>-1) { //only use Seed Reset when not in a Loss Streak
		seedChangeFlag = false;
		randomClientSeed = generateRandomClientSeed(10); // Generates a 10-character long client seed
		randomServerSeed = generateRandomServerSeed(64); // Generates a 64 hex character long server seed
	}
}

// Main function to analyze bets based on the given parameters
async function analyzeBets(serverSeed, clientSeed, startNonce, numberOfBets) {
    

    while (betCount <= totalBets) {
        checkResetSeed();
        //Bet results and balance controls
        //****************************************************************************************************
        nonce++;
        previousChance = chance;
		previousBet = nextBet;
		cumLoss -= nextBet;
		progress = (betCount / totalBets) * 100;
        const roll = getDiceRoll(serverSeed, clientSeed, nonce, 0);
        wager += nextBet;
        if (balance < lowestBalance) {
            lowestBalance = balance;
        }		
        if (nextBet > largestBetPlaced) {
            largestBetPlaced = nextBet;
        }
		if (cumLoss < maxBalanceDrawDown) {
			maxBalanceDrawDown = cumLoss;
		}
		if (profit<maxBalanceDrawDown){
			maxBalanceDrawDown = profit;
		}
		if (maxBalanceDrawDown < -40 && RP1LSSTART===0) {
			RP1LSSTART=currentStreak*-1;
		}	
		if (maxBalanceDrawDown < -800 && RP1LSEND===0) {
			RP1LSEND=currentStreak*-1;
			RP1LS=(maxBalanceDrawDown*-1)+50;
		}
		RP2LS = (maxBalanceDrawDown*-1) - RP1LS + 50;		
        winRatio = (winCount / betCount) * 100;
        if (betHigh) {
            win = roll > (100 - chance);
        } else {
            win = roll < chance;
        }
        progress = (betCount  / totalBets) * 100;  // update progress        
        
        if (nextBet > balance) {
            const redText = '\x1b[31m'; // ANSI escape code for red text
            const resetText = '\x1b[0m'; // ANSI escape code to reset text color
            console.log(`${redText}BUST!${resetText}`);
            console.log('Server Seed:', serverSeed, 'Client Seed:', clientSeed, 'Nonce:', nonce);
            console.log(`${redText}##########################################${resetText}`);
            console.log(`${redText}# Bet Summary:${resetText}`);
            console.log(`${redText}# Total Bets: ${totalBets}${resetText}`);
            console.log(`${redText}# Total Profits: ${profit.toFixed(4)}${resetText}`);
            console.log(`${redText}# Total Wager: ${wager.toFixed(4)}${resetText}`);
            console.log(`${redText}# Largest Bet placed: ${largestBetPlaced.toFixed(4)}${resetText}`);
            console.log(`${redText}# Highest Losing Streak: ${maxStreak}${resetText}`);
            console.log(`${redText}# Closing Server Seed: ${serverSeed}${resetText}`);
            console.log(`${redText}# Closing Client Seed: ${clientSeed}${resetText}`);
            console.log(`${redText}# Closing Nonce: ${nonce}${resetText}`);
            console.log(`${redText}# Current Balance : ${balance}${resetText}`);
            console.log(`${redText}# Next Bet: ${nextBet}${resetText}`);
            console.log(`${redText}##########################################${resetText}`);
            process.exit();
        }
        //****************************************************************************************************

        //doBet()
        //****************************************************************************************************

        if (!win){
            
        }
        if (win) {
			payOut = ((100 - houseEdge) / (chance / 100) / 100);
			roundProfit = ((nextBet * payOut) - nextBet);
            //nextBet = baseBet;
            //chance = baseChance;
            winCount++;
            winStreak++;
            profit += roundProfit; // Update profit
            currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
            bethighCount ++;
			cumLoss = 0;
        } else {
            roundProfit = (0 - nextBet);			
            payOut = 0;
            winStreak = 0;
            profit += roundProfit; // Update profit
            currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
            if (currentStreak < maxStreak) {
                maxStreak = currentStreak;
            }
        }

        if (win){ 
			nextBet = 0;
        } else {
				nextBet = nextBet * 2.11;
		}
		if (currentStreak <= 11) {
			nextBet = nextBet * (1+(-(currentStreak-1)/100));
		}

		if (currentStreak === -5) {
			nextBet = baseBet;
		}

	
        balance = (startBalance + profit); //update balance	

        chance = Math.min(Math.max(chance, MIN_CHANCE), MAX_CHANCE);	
	

        //Logging
        if (!debugMode) {
            if (nonce % 100000 === 0) {
                const endTime = Date.now();
                const runTimeSeconds = (endTime - startTime) / 1000;
                const betsPerSecond = ((nonce - startNonce + 1) / runTimeSeconds).toLocaleString('en-US', { maximumFractionDigits: 2 });
                const profitPerHour = (profit / (nonce - startNonce + 1)) * 11000;
				const wagerPerHour = (wager / (nonce - startNonce + 1)) * 11000;
                const profitPerDay = profitPerHour*24;
				const wagerPerDay = wagerPerHour*24;				
                    console.log(
                        [
                        'Progress %: ' + progress.toFixed(2),
                        'Bet Count ' + betCount,
                        'Max Bets: ' + totalBets,
                        'Balance: ' + balance.toFixed(4),
						'Max DrawDown: ' + maxBalanceDrawDown.toFixed(4),
                        'profit: ' + profit.toFixed(2),
                        'Wins Count: ' + winCount,
                        'Win Ratio: ' + winRatio.toFixed(2),
                        'Total Wagered: ' + wager.toFixed(8),
                        'Worst Loss Streak: ' + maxStreak,
                        'Bets per Second: ' + betsPerSecond,
						'Profit per Hour: ' + profitPerHour.toFixed(2),
						'Profit per Day: ' + profitPerDay.toFixed(2),
						'Wager per Hour: ' + wagerPerHour.toFixed(2),
						'Wager per Day: ' + wagerPerDay.toFixed(2),
						'Largest Bet Placed: ' + largestBetPlaced.toFixed(4),						
                    ].join(' | ')
                    );
            }
        }   else {
                 console.log(
                    win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
                    [
                        'Server Seed: ' + serverSeed,
                        'Client Seed: ' + clientSeed,
                        'Nonce: ' + nonce,
                        'Progress %: ' + progress.toFixed(4),
                        'Bet Amount: ' + previousBet.toFixed(6),
                        'Win Streak: ' +winStreak, 
                        'Chance: ' + previousChance,
                        'Bet High: ' + betHigh,
                        'Result: ' + roll,
                        'Payout: ' + payOut,
                        'Round Profit: ' + roundProfit.toFixed(6),
                        'Wagered: ' + wager.toFixed(4),
                        'profit: ' + profit.toFixed(4),
                        'Balance: ' + balance.toFixed(4),
                        'Current Streak: ' + currentStreak,
                        'Worst Streak: ' + maxStreak,
						'Largest Bet Placed: ' + largestBetPlaced.toFixed(4),
                        
                    ].join(' | ')
                    );
                    await betDelay(debugDelay); // Wait for before the next iteration
            
            }
        betCount++    
    }

    return {
        betCount: numberOfBets,
        maxLossStreak: maxStreak,
        maxStreakNonce: maxStreakNonce
    };
}

// analyzeBets function
const result = analyzeBets(
    serverSeed, // Server Seed
    clientSeed, // Client Seed
    nonce, // Starting nonce position
    totalBets // Total number of bets to analyze
);


// Calculating and displaying the results
result.then((result) => {
    const endTime = Date.now();
    const runTimeSeconds = (endTime - startTime) / 1000;
    const betsPerSecond = result.betCount / runTimeSeconds;
    console.log('Complete!');
    console.log ('Run Time: ' + runTimeSeconds + (' Seconds.'))
    console.log ('Bets Per Second: ' + betsPerSecond);
      // Display the summary log
    const redText = '\x1b[31m'; // ANSI escape code for red text
    const greenText = '\x1b[32m'; // ANSI escape code for green text
    const resetText = '\x1b[0m'; // ANSI escape code to reset text color
    console.log(`${greenText}##########################################${resetText}`);
    console.log(`${greenText}# Bet Summary:${resetText}`);
    console.log(`${greenText}# Total Bets: ${totalBets}${resetText}`);
    console.log(`${greenText}# Total Profits: ${(profit).toFixed(4)}${resetText}`);
    console.log(`${greenText}# Total Wager: ${wager.toFixed(4)}${resetText}`);
    console.log(`${redText}# Max Balance Draw Down: ${maxBalanceDrawDown.toFixed(4)}${resetText}`);
    console.log(`${greenText}# Largest Bet placed: ${largestBetPlaced.toFixed(4)}${resetText}`);
    console.log(`${greenText}# Highest Losing Streak: ${maxStreak}${resetText}`);
    console.log(`${greenText}# Closing Server Seed: ${serverSeed}${resetText}`);
    console.log(`${greenText}# Closing Client Seed: ${clientSeed}${resetText}`);
    console.log(`${greenText}# Closing Nonce: ${nonce}${resetText}`);
    console.log(`${greenText}# RP1 (${RP1LS.toFixed(2)}) - Start LS: ${RP1LSSTART} - RP2 (${RP2LS.toFixed(2)}) - Start LS: ${RP1LSEND+1}${resetText}`);	
    console.log(`${greenText}##########################################${resetText}`);
});
