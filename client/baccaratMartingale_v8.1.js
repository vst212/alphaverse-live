//********************************************************************************************
//** Baccarat Martingale based on this video: https://www.youtube.com/watch?v=c3unwSQSggc   **
//** Version: 8.0                                                                           ** 
//** Date: 02/11/2024                                                                       **
//** Author: MrBtcGambler                                                                   **
//** Start Balance: 85 TRX           (51)                                                        **
//** Recovery Pot: 6370 TRX           (3823)                                                      **
//** Bust Threshold: 20.5 TRX                                                               **
//** Max Loss Streak: -24 TRX                                                               **
//**                                                                                        **
//** Details:                                                                               **
//** v 8, Resets Max Loss Streak on Seed Reset                                              **
//** v 7, Increased start balance to 85 TRX                                                 **
//** v 6, fixed Seed Reset and improved logging and error handling                          **
//** v 5, fixed error with next bet                                                         **
//** v 4, treat tied as tied and nextBet does not change                                    **
//** Experiment using qBot: https://qbot.gg/?r=mrbtcgambler                                 **
//** Set to baseBet on Banker, pays out 1.95X, previous bet on draw and Double down on loss **
//** 3.7M test bets on qBot showed a max loss streak of 18                                  **
//*****************************


import { unlink, access, constants } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import StakeApi from "./StakeApi.mjs";

// Initialize configurations
const clientConfig = JSON.parse(await readFile(new URL('../client_config.json', import.meta.url)));
const serverConfig = JSON.parse(await readFile(new URL('../server_config.json', import.meta.url)));

let config = {
    apiKey: process.env.CLIENT_API_KEY || clientConfig.apiKey,
    password: process.env.CLIENT_PASSWORD || clientConfig.password,
    twoFaSecret: process.env.CLIENT_2FA_SECRET || clientConfig.twoFaSecret || null,
    currency: process.env.CLIENT_CURRENCY || clientConfig.currency,
    recoverAmount: process.env.SERVER_RECOVER_AMOUNT || serverConfig.recoverAmount,
    recoverThreshold: process.env.CLIENT_RECOVER_THRESHOLD || clientConfig.recoverThreshold,
    funds: null,
    withdrawAddress: process.env.WITHDRAW_ADDRESS || clientConfig.withdrawAddress,
    depositAddress: process.env.DEPOSITE_ADDRESS || clientConfig.depositeAddress,
    privateKey: process.env.PRIVATE_KRY || clientConfig.privateKey
};

// Initialize for auto cashin cashout
let startBalance = 52,
	check_withdraw = 0,
	wagerBet = 0.7, // used for wager stage - 98% dice
	wagerStageRemaining=-1,
	lastDepositAttempt = 0,
	totalDeposited = 0,
	DEPOSIT_COOLDOWN = 2 * 60 * 1000, // 2 minutes
	MANUAL_INTERVENTION_THRESHOLD = 500;

	
	
	
// Create StakeApi instance
const apiClient = new StakeApi(config.apiKey);

// Fetch initial funds
config.funds = await apiClient.getFunds(config.currency);

// Deposit to vault to set up recovery pot
//await apiClient.depositToVault(config.currency, config.funds.available - clientConfig.recoverThreshold);
//await new Promise(r => setTimeout(r, 2000));



// Initialize bot state variables
let balance = config.funds.available,
    version = 8.1,
    game = "baccarat",
    stage = 1, // not used but on the main server page
    betDelay = 40, // delay in milliseconds
    currentStreak = 0,
    profit = 0,
    vaulted = 0,
    wager = 0,
    bets = 0,
    winCount = 0,
    highestLosingStreak = 0,
    lastHourBets = [],
    seedReset = 0,
    resetSeedAfter = 5000, // Reset seed after X bets
    paused = false,
    win = false,
    tied = false,
    lost = false,
    // Baccarat Bet Settings
    baseBet = 0.000062,
    previousBet = baseBet,
    nextBet = baseBet,
    tieBet = 0, // Baccarat tie bet amount
    playerBet = 0, // Baccarat player bet amount
    bankerBet = baseBet, // Baccarat banker bet amount
    pauseLogged = false;



async function initialSetup() {
    try {
		
		config.funds = await apiClient.getFunds(config.currency);
		console.log(config.funds)
		console.log(config.funds.vault)
		if (config.funds.vault > 0) {
			console.log("withdraw money from vault")
			await apiClient.withdrawFromVault(config.currency, config.funds.vault,config.password,config.twoFaSecret);
			// Add a delay here for 2FA renewal
            console.log("Waiting for 2FA renewal...");
            await new Promise(resolve => setTimeout(resolve, 30000));
		}
		
        config.funds = await apiClient.getFunds(config.currency);
        balance = config.funds.available; // Update the global balance
        let balanceInitial = balance;
        let recoverAmount = config.recoverAmount;
		try{
			await apiClient.claimRakeBack();
			console.log(`claimRakeBack success`)
		}catch{
			console.log(`claimRakeBack error`)
		}
		try{
			await apiClient.claimReload(config.currency);
			console.log(`claimReload success`)
		}catch{
			console.log(`claimReload error`)
		}
        const totalAvailable = (balance + config.funds.vault) - startBalance - 0.01;
        const withdrawAmount = Math.floor(totalAvailable);
		
        if (balance < startBalance) {
            const depositAmount = startBalance - balance + 0.001; // Add a small buffer to ensure we reach the start balance
            console.log(`Balance (${balance}) is less than start balance (${startBalance}). Depositing ${depositAmount} to reach start balance.`);

            try {
                lastDepositAttempt = Date.now();
                const txHash = await apiClient.depositTRX(config.privateKey, depositAmount, config.depositAddress);
                if (txHash) {
                    console.log(`[INFO] Deposited ${depositAmount}. Transaction hash: ${txHash}`);
                    console.log('[INFO] Waiting for deposit confirmation...');
                    totalDeposited += depositAmount;

                    // Wait for balance to update before proceeding
                    while (true) {
                        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 10 seconds before checking again
                        config.funds = await apiClient.getFunds(config.currency);
                        balance = config.funds.available;
                        if (balance >= startBalance) {
                            console.log(`[INFO] Balance updated to ${balance}. Proceeding with next steps.`);
                            break;
                        } else {
                            console.log(`[INFO] Balance (${balance}) still insufficient. Waiting for deposit confirmation...`);
                        }
                    }
                } else {
                    console.error('[ERROR] Failed to deposit.');
                    return false;
                }
            } catch (error) {
                console.error('[ERROR] Error during deposit:', error);
                return false;
            }
        }

        if (withdrawAmount >= 20) {
            console.log(`Money enough for withdraw (>=20 ${config.currency}), amount: ${withdrawAmount}`);
            if (config.funds.vault >= 1) {
                console.log('Withdrawing everything from vault...');
                await apiClient.withdrawFromVault(config.currency, config.funds.vault, config.password, config.twoFaSecret);
                console.log(`Withdrawn ${config.funds.vault} ${config.currency} from vault`);
            }

            config.funds = await apiClient.getFunds(config.currency);
            balance = config.funds.available;

            // Add a delay here for 2FA renewal
            console.log("Waiting for 2FA renewal...");
            await new Promise(resolve => setTimeout(resolve, 30000));
            while (true) {
                try {
                    const withdrawalResult = await apiClient.withdraw(config.currency, config.withdrawAddress, withdrawAmount, config.twoFaSecret, null);
                    if (withdrawalResult && withdrawalResult.id) {
                        console.log(`Successfully withdrew ${withdrawAmount} ${config.currency}. Transaction ID: ${withdrawalResult.id}`);
                        break;
                    } else {
                        console.log(`Withdrawal may have failed. Please check your balance and transaction history.`);
                    }
                } catch (error) {
                    console.error("Withdrawal error:", error.message);
                    console.log("Withdrawal failed. The funds remain in your account.");
                    console.log("Retry after 30 seconds");
                    await new Promise(resolve => setTimeout(resolve, 30000));
                }
            }

            config.funds = await apiClient.getFunds(config.currency);
            balance = config.funds.available;
        } else {
            console.log(`Money not enough for withdraw (>=20 ${config.currency}), amount: ${withdrawAmount}`);
            console.log(balance);
            if (balance > startBalance) {
                const depositAmount = balance - startBalance;
                await apiClient.depositToVault(config.currency, depositAmount);
                console.log(`Deposited ${depositAmount} ${config.currency} to vault`);
            }
        }

        // Update balance one last time after all operations
        config.funds = await apiClient.getFunds(config.currency);
        balance = config.funds.available;
    } catch (e) {
        console.error('[ERROR]', e);
    }
}

// Call the initial setup
await initialSetup();


// Function to calculate bets per hour
function getBetsPerHour() {
    const now = Date.now();
    lastHourBets = lastHourBets.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);
    return lastHourBets.length;
}

// Function to handle betting logic
async function doBet() {
	if (bets % 10000 === 0) {
    	try{
			await apiClient.claimRakeBack();
			console.log(`claimRakeBack success`)
		}catch{
			console.log(`claimRakeBack error`)
		}
		
    }
	
    if (bets % 300000 === 0) {
    	try{
			await apiClient.claimReload(config.currency);
			console.log(`claimReload success`)
		}catch{
			console.log(`claimReload error`)
		}
    }		
	
	
	if ( (win || tied) && check_withdraw == 1) {
		if (win && wagerStageRemaining==-1){
			while (true) {
				try{
					if ((config.funds.available + config.funds.vault) - startBalance - 0.01>=20){
						console.log("money enough for withdraw (>=20), amount:")
						console.log((balance + config.funds.vault) - startBalance - 0.01)
						if (config.funds.vault >= 1) {
							await apiClient.withdrawFromVault(config.currency, config.funds.vault,config.password,config.twoFaSecret);
							console.log("money enough for withdraw from vault")
							console.log("Waiting for 2FA renewal...");
							await new Promise(resolve => setTimeout(resolve, 30000));
							
						}
						config.funds = await apiClient.getFunds(config.currency);
						balance = config.funds.available;
						console.log("check for amount to wager");
						config.funds = await apiClient.getFunds(config.currency);
						balance = config.funds.available;
						await new Promise(resolve => setTimeout(resolve, 1000));
						wagerStageRemaining = Math.round((balance*0.22 / wagerBet)/2);
						console.log(`Need to wager for ${wagerStageRemaining}`);
					} else{
						console.log("money not enough for withdraw (>=20), amount:")
						console.log(balance)
						check_withdraw = 0;
					}
					break;
				}catch{
					console.log(`Error in check for amount to wager, retry after 10 second`);
					await new Promise(resolve => setTimeout(resolve, 10000));
				}
			}
		} else {
			console.log("check for wagerStageRemaining");
			if (wagerStageRemaining >0) {
				console.log(`still need to wager for ${wagerStageRemaining} times`);
				wagerStageRemaining = wagerStageRemaining-1;
			} else if (wagerStageRemaining == 0) {
				console.log("wager enough to withdraw")
				config.funds = await apiClient.getFunds(config.currency);
				balance = config.funds.available;
				console.log(`Going to withdraw ${config.funds.available - startBalance}`);
				await apiClient.withdraw(config.currency, config.withdrawAddress, config.funds.available - startBalance , config.twoFaSecret);
				config.funds = await apiClient.getFunds(config.currency);
				balance = config.funds.available;
				check_withdraw = 0;	
				wagerStageRemaining = -1;
				totalDeposited = 0;
				nextbet = baseBet;
			}
		}
	} 

	
	
	
    seedReset++;

    if (win) {
        winCount++;
        nextBet = baseBet;
        bankerBet = baseBet;
        playerBet = 0;
        tieBet = 0;
    } else if (lost){
        nextBet = previousBet * 2.0527; // Adds 105.27% to each loss for full recovery
        bankerBet = nextBet;
        playerBet = 0;
        tieBet = 0;
    } else {
        // No change to nextBet if it's a tie or other conditions
        bankerBet = nextBet;
        playerBet = 0;
        tieBet = 0;
    }
    
	
	//Start Wager Stage by reaching the Double WagerBet
	if (wagerStageRemaining>=0) {
		nextBet = wagerBet*2;
        bankerBet = nextBet/2;
        playerBet = nextBet/2;
        tieBet = 0;
	}
	


	//start recovery
	if (balance>=80) {
		console.log("check withdraw from vault for bet, amount in vault:")
		config.funds = await apiClient.getFunds(config.currency);
        balance = config.funds.available;
		console.log(config.funds.vault)
		if (config.funds.vault >= 1) {
			console.log("withdraw money from vault")
			await apiClient.withdrawFromVault(config.currency, config.funds.vault,config.password,config.twoFaSecret);
			config.funds = await apiClient.getFunds(config.currency);
			balance = config.funds.available;
		}
		check_withdraw = 1;
	}

        // Check if it's time to reset the seed
    if (seedReset > resetSeedAfter && currentStreak > 0)  {
        try {
            console.log(`[INFO] Resetting seed after ${seedReset} bets and current streak of ${currentStreak}`);
            const resetResponse = await apiClient.resetSeed();

            // Optional: Parse and handle the resetResponse if needed
            // const resetData = JSON.parse(resetResponse);
            console.log('[SUCCESS] Seed reset successfully.');
 
            // Reset the seedReset counter
            seedReset = 0;
			highestLosingStreak = 1;
            // Optional: Reset betting parameters if necessary
            nextBet = baseBet;
            previousBet = baseBet;
            bankerBet = nextBet;
            currentStreak = 0;
            console.log('[INFO] Betting parameters have been reset after seed reset.');
        } catch (error) {
            console.error('[ERROR] Failed to reset seed:', error);
            // Optional: Implement retry logic or handle the failure accordingly
        }
    }
}

// Delete old state file if it exists
const dicebotStateFilename = new URL('/mnt/ramdrive/dicebot_state.json', import.meta.url);
access(dicebotStateFilename, constants.F_OK, (error) => {
    if (!error) {
        unlink(dicebotStateFilename, (err) => {
            if (err) console.error('[ERROR] Failed to delete old state file:', err);
            else console.log('[INFO] Old state file deleted.');
        });
    }
});

// Function to write current stats to a file
async function writeStatsFile() {
    try {
        await writeFile(dicebotStateFilename, JSON.stringify({
            bets: bets,
            stage: stage,
            wager: wager,
            vaulted: vaulted,
            profit: profit,
            betSize: nextBet,
            currentStreak: currentStreak,
            highestLosingStreak: highestLosingStreak,
            betsPerHour: getBetsPerHour(),
            lastBet: (new Date()).toISOString(),
            wins: winCount,
            losses: (bets - winCount),
            version: version,
            paused: paused
        }), 'utf8');
        //console.log('[INFO] Stats file updated.');
    } catch (error) {
        console.error('[ERROR] Failed to write stats file:', error);
    }
}


async function checkAndRefillBalance() {
    const now = Date.now();
    if (now - lastDepositAttempt < DEPOSIT_COOLDOWN) {
        console.log('[INFO] Waiting for previous deposit to process...');
        return false;
    }

    config.funds = await apiClient.getFunds(config.currency);
    let balance = config.funds.available;

    if (balance < nextBet) {
        console.log(`[INFO] Balance (${balance}) is insufficient for next bet ${nextBet}.`);
        const depositAmount = Math.max(Math.ceil(nextBet - balance), 110);
        console.log(`Need to deposit ${depositAmount}`);

        if (totalDeposited + depositAmount > MANUAL_INTERVENTION_THRESHOLD) {
            console.log('[ALERT] Total deposits would exceed 1001. Manual intervention required.');
            paused = true;
            return false;
        }

        try {
            lastDepositAttempt = now;
            const txHash = await apiClient.depositTRX(config.privateKey, depositAmount, config.depositAddress);
            if (txHash) {
                console.log(`[INFO] Deposited ${depositAmount}. Transaction hash: ${txHash}`);
                console.log('[INFO] Waiting for deposit confirmation...');
                totalDeposited += depositAmount;

                // Wait for balance to update before proceeding
                while (true) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 10 seconds before checking again
                    config.funds = await apiClient.getFunds(config.currency);
                    balance = config.funds.available;
                    if (balance >= nextBet) {
                        console.log(`[INFO] Balance updated to ${balance}. Proceeding with next bet.`);
                        return true;
                    } else {
                        console.log(`[INFO] Balance (${balance}) still insufficient. Waiting for deposit confirmation...`);
                    }
                }
            } else {
                console.error('[ERROR] Failed to deposit.');
                return false;
            }
        } catch (error) {
            console.error('[ERROR] Error during deposit:', error);
            return false;
        }
    }
    return false;
}



// Initialize additional variables
let newBalance = null,
    roundProfit = 0,
    pauseFileUrl = new URL('pause', import.meta.url);

// Main betting loop
while (true) {
    // Check if the bot is paused by checking for the existence of the pause file
    access(pauseFileUrl, constants.F_OK, (error) => {
        paused = !error;
    });

    if (paused) {
        if (!pauseLogged) {
            console.log('[INFO] Paused...');
            pauseLogged = true;
        }
        await writeStatsFile();
        await new Promise(r => setTimeout(r, 1000));
        continue;
    } else {
        pauseLogged = false; // Reset the flag when not paused
    }

    if (game === "baccarat") {
        try {
            let baccaratBet;

            // Place a Baccarat bet
            baccaratBet = await apiClient.baccaratBet(tieBet, playerBet, bankerBet, config.currency)
                .then(async (result) => {
                    try {
                        const data = JSON.parse(result);

                        if (data.errors) {
                            console.error('[ERROR] baccaratBet response: ', data);

                            config.funds = await apiClient.getFunds(config.currency);
                            balance = config.funds.available;
				// If it's an insufficient balance error, trigger a deposit
				if (data.errors[0].errorType === 'insufficientBalance') {
					await checkAndRefillBalance();
				};
				if (data.errors[0].errorType === 'insignificantBet') {
					baseBet = baseBet + 0.000001;
				};
		      
							
                            return null;
                        }

                        return data.data.baccaratBet;
                    } catch (e) {
                        console.error('[ERROR]', e, result);

                        config.funds = await apiClient.getFunds(config.currency);
                        balance = config.funds.available;

                        return null;
                    }
                })
                .catch(error => {
                    console.error('[ERROR] Failed to place Baccarat bet:', error);
                    return null;
                });

            if (!baccaratBet || !baccaratBet.state) {
                console.log('[WARN] Invalid baccaratBet response. Pausing for 5 seconds...');
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            // Update funds based on the bet result
            newBalance = baccaratBet.user.balances.find((balance) => balance.available.currency === config.currency);
            if (!newBalance) {
                console.error('[ERROR] Failed to find balance for currency:', config.currency);
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            config.funds = {
                available: parseFloat(newBalance.available.amount),
                vault: parseFloat(newBalance.vault.amount),
                currency: config.currency
            };

            balance = config.funds.available;

            wager += nextBet;
            profit -= nextBet;
            bets++;
            lastHourBets.push(Date.now());

            // Determine the outcome of the bet
            if (baccaratBet.payoutMultiplier >= 1.1) {
                win = true;
                tied = false;
                lost = false;
            } else if (baccaratBet.payoutMultiplier === 1) {
                tied = true;
                win = false;
                lost = false;
            } else if (baccaratBet.payoutMultiplier <= 0.9) {
                lost = true;
                win = false;
                tied = false;
            } else {
                // Handle any unexpected payoutMultiplier values
                win = false;
                tied = false;
                lost = false;
            }

            // Update profit and streaks based on the outcome
            if (win) {
                roundProfit = parseFloat(baccaratBet.payout);
                profit += roundProfit;

                if (currentStreak >= 0) {
                    currentStreak++;
                } else {
                    currentStreak = 1;
                }
            }

            if (tied) {
                roundProfit = parseFloat(baccaratBet.payout);
                profit += roundProfit;
                // Streak remains unchanged
            }

            if (lost) {
                if (currentStreak <= 0) {
                    currentStreak--;
                } else {
                    currentStreak = -1;
                }
            }

            // Log the outcome of the bet
            console.log(
                win ? '\x1b[32m%s\x1b[0m' : (tied ? '\x1b[33m%s\x1b[0m' : '\x1b[37m%s\x1b[0m'),
                [
                    'Game: ' + game,
                    'Banker Bet: ' + bankerBet.toFixed(4),
                    // 'Player: ' + playerBet.toFixed(4),
                    // 'Tie: ' + tieBet.toFixed(4),
                    'Balance: ' + balance.toFixed(6) + ' ' + config.currency.toUpperCase(),
                    'Wager: ' + wager.toFixed(4) + ' ' + config.currency.toUpperCase(),
                    'Payout Multiplier: ' + baccaratBet.payoutMultiplier,
                    'Current Streak: ' + currentStreak,
                    'Game Result: ' + (win ? 'Win' : (tied ? 'Tied' : 'Lose')) // Added game result
                ].join(' | ')
            );

            // Execute betting logic based on the outcome
            await doBet();

            // Update previous bet
            previousBet = nextBet;

            // Update the highest losing streak
            if (currentStreak < 0) {
                highestLosingStreak = Math.max(highestLosingStreak, Math.abs(currentStreak));
            }

            // Write the current stats to the file
            await writeStatsFile();

            // Delay before the next bet
            await new Promise(r => setTimeout(r, betDelay));
        } catch (e) {
            console.error('[ERROR] Exception in betting loop:', e);

            // Attempt to refresh funds in case of an error
            try {
                config.funds = await apiClient.getFunds(config.currency);
                balance = config.funds.available;
            } catch (fundError) {
                console.error('[ERROR] Failed to refresh funds:', fundError);
            }

            // Optional: Pause the bot or implement additional error handling
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}
