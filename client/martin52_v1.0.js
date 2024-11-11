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

let startBalance = 26,
    check_withdraw = 0,
    wagerBet = 0.7, // used for wager stage - 98% dice
    wagerStageRemaining=-1,
    lastDepositAttempt = 0,
    totalDeposited = 0,
    DEPOSIT_COOLDOWN = 2 * 60 * 1000, // 2 minutes
    MANUAL_INTERVENTION_THRESHOLD = 999;


// Create StakeApi instance
const apiClient = new StakeApi(config.apiKey);

// Fetch initial funds
config.funds = await apiClient.getFunds(config.currency);

// Deposit to vault to set up recovery pot
//await apiClient.depositToVault(config.currency, config.funds.available - clientConfig.recoverThreshold);
//await new Promise(r => setTimeout(r, 2000));



// Initialize bot state variables
let balance = config.funds.available,
    version = 1.0,
    game = "dice",
    baseBet = 0.000063,// baseBet: 0.0001 TRX (minimum Bet)
    wagerMode = false,
    initialBetSize = 0,
    betHigh = true,
    win = false,
    betDelay = 40, // delay in milliseconds
    currentStreak = 0,
    profit = 0,
    vaulted = 0,
    wager = 0,
    bets = 0,
    stage = 0,
    winCount = 0,
    lossCount = 0,
    previousBet = 0,
    nextBet = initialBetSize,
    baseChance = 52.00,
    chance = baseChance,
    highestLosingStreak = 0,
    lastHourBets = [],
    paused = false,
    simulation = false,
    seedChangeAfterRolls = 77000, // seed change will only be activated at a win streak
    seedChangeAfterWins = 0,
    seedChangeAfterLosses = 0,
    seedChangeAfterWinStreak = 0,
    seedChangeAfterLossStreak = 0,
    seedChangeFlag = false,
    variableToUse = 0,
    pauseLogged = false;




const MIN_CHANCE = 0.75;
const MAX_CHANCE = 98.00;



async function initialSetup() {
    try {

        config.funds = await apiClient.getFunds(config.currency);
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


function resetStats() {
    profit = 0;
}

function getBetsPerHour() {
    const now = Date.now();
    lastHourBets = lastHourBets.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);
    return lastHourBets.length;
}

/**
 * Returns a random number between min (inclusive) and max (exclusive)
 */
function getRandomArbitrary(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 * The value is no lower than min (or the next integer greater than min
 * if min isn't an integer) and no greater than max (or the next integer
 * lower than max if max isn't an integer).
 * Using Math.round() will give you a non-uniform distribution!
 */
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * seed Reset only at win Streaks to not Reset during a Loss Streak
 */
function checkResetSeed() {
    if (seedChangeAfterRolls && bets % seedChangeAfterRolls === 0) {
        seedChangeFlag = true;
    } else if (win) {
        if (seedChangeAfterWins && winCount % seedChangeAfterWins === 0) {
            seedChangeFlag = true;
        } else if (seedChangeAfterWinStreak && currentStreak % seedChangeAfterWinStreak === 0) {
            seedChangeFlag = true;
        }
    } else {
        if (seedChangeAfterLosses && lossCount % seedChangeAfterLosses === 0) {
            seedChangeFlag = true;
        } else if (seedChangeAfterLossStreak && currentStreak % seedChangeAfterLossStreak === 0) {
            seedChangeFlag = true;
        }
    }
    if (seedChangeFlag === true && currentStreak>-1) { //only use Seed Reset when not in a Loss Streak
        seedChangeFlag = false;
        apiClient.resetSeed();
    }
}

function isMatching(conditionType, conditionsOn) {
    if (conditionType === 'bets') {
        variableToUse = 0;
        switch (conditionsOn.betType) {
            case 'bet':
                variableToUse = bets;
                break;
            case 'win':
                if (!win) {
                    return false;
                }
                variableToUse = conditionsOn.type === 'every' ? winCount : currentStreak;
                break;
            case 'lose':
                if (win) {
                    return false;
                }
                variableToUse = conditionsOn.type === 'every' ? lossCount : -currentStreak;
                break;
            default:
                log(`error in conditions, not recognized condition bet type ${conditionsOn.betType}`);
                engine.stop();
        }

        switch (conditionsOn.type) {
            case 'every':
                return !(variableToUse % conditionsOn.value);
            case 'everyStreakOf':
                return !(variableToUse % conditionsOn.value);
            case 'firstStreakOf':
                return variableToUse === conditionsOn.value;
            case 'streakGreaterThan':
                return variableToUse > conditionsOn.value;
            case 'streakLowerThan':
                return variableToUse < conditionsOn.value;
            default:
                log(`error in conditions, not recognized condition on type ${conditionsOn.type}`);
                engine.stop();
        }
    } else // 'profit'
    {
        variableToUse = 0;
        switch (conditionsOn.profitType) {
            case 'balance':
                variableToUse = balance;
                break;
            case 'loss':
                variableToUse = -profit;
                break;
            case 'profit':
                variableToUse = profit;
                break;
            default:
                log(`error in conditions, not recognized condition on profitType ${conditionsOn.profitType}`);
                engine.stop();
        }

        switch (conditionsOn.type) {
            case 'greaterThan':
                return variableToUse > conditionsOn.value;
            case 'greaterThanOrEqualTo':
                return variableToUse >= conditionsOn.value;
            case 'lowerThan':
                return variableToUse < conditionsOn.value;
            case 'lowerThanOrEqualTo':
                return variableToUse <= conditionsOn.value;
            default:
                log(`error in conditions, not recognized condition on type ${conditionsOn.type}`);
                engine.stop();
        }
    }
}

function execute(doAction) {
    switch (doAction.type) {
        case 'increaseByPercentage':
            //nextBet *= 1 + doAction.value / 100;
            nextBet *= getRandomArbitrary((1 + doAction.value / 100), ((1 + doAction.value / 100)+0.002)); //add randomness to the increases
            break;
        case 'decreaseByPercentage':
            nextBet *= 1 - doAction.value / 100;
            break;
        case 'increaseWinChanceBy':
            chance *= 1 + doAction.value / 100;
            break;
        case 'decreaseWinChanceBy':
            chance *= 1 - doAction.value / 100;
            break;
        case 'addToAmount':
            nextBet += doAction.value;
            break;
        case 'subtractFromAmount':
            nextBet -= doAction.value;
            break;
        case 'addToWinChance':
            chance += doAction.value;
            break;
        case 'subtractFromWinChance':
            chance -= doAction.value;
            break;
        case 'setAmount':
            nextBet = doAction.value;
            break;
        case 'setWinChance':
            chance = doAction.value;
            break;
        case 'switchOverUnder':
            betHigh = !betHigh;
            break;
        case 'resetAmount':
            nextBet = initialBetSize;
            break;
        case 'resetWinChance':
            chance = initialChance;
            break;
        case 'stop':
            engine.stop();
            break;
        default:
            log(`error in conditions, not recognized action type ${doAction.type}`);
            engine.stop();
    }
}

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

    if (win) {
        winCount++;
    }
    else {
        lossCount++;
    }
    if (win && check_withdraw == 1) {
        if (wagerStageRemaining==-1){
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
                        wagerStageRemaining = Math.round(balance*0.22 / wagerBet);
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
            } else {
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
                nextBet = baseBet;
            }
        }
    }



    checkResetSeed();


    if (win){
        nextBet = 0;
    } else {
        nextBet = nextBet * 2.11;
        if (currentStreak <= 11) {
            nextBet = nextBet * (1+(-(currentStreak-1)/100));
        }

        if (currentStreak === -5) {
            nextBet = baseBet;
        }

        //Start Wager Stage by reaching the Double WagerBet
        if (wagerStageRemaining>=0) {
            nextBet = wagerBet;
            chance = 51;
        }



        if (balance >=(50)) {
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

        chance = Math.min(Math.max(chance, MIN_CHANCE), MAX_CHANCE);
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
            const depositAmount = Math.ceil(nextBet - balance);
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

    let diceRoll = null,
        newBalance = null,
        roundProfit = 0,
        pauseFileUrl = new URL('pause', import.meta.url);
    while (true) {
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

        try {
            diceRoll = await apiClient.diceRoll(chance, betHigh, simulation ? 0 : nextBet, config.currency).then(async (result) => {
                try {
                    const data = JSON.parse(result);

                    if (data.errors) {
                        console.error('[ERROR] Dicebet response: ', data);

                        if (!simulation) {
                            config.funds = await apiClient.getFunds(config.currency);
                            balance = config.funds.available;
                        }
                        // If it's an insufficient balance error, trigger a deposit
                        if (data.errors[0].errorType === 'insufficientBalance') {
                            await checkAndRefillBalance();
                        };
                        if (data.errors[0].errorType === 'insignificantBet') {
                            baseBet = baseBet + 0.000001;
                        };


                        return null;
                    }

                    return data.data.diceRoll;
                } catch (e) {
                    console.error('[ERROR]', e, result);

                    if (!simulation) {
                        config.funds = await apiClient.getFunds(config.currency);
                        balance = config.funds.available;
                    }

                    return null;
                }
            }).catch(error => console.error(error));

            if (!diceRoll || !diceRoll.state) {
                console.log('[ERROR] Pausing for 5 seconds...', diceRoll);
                await new Promise(r => setTimeout(r, 5000));
                paused = false;
                continue;
            }

            if (simulation) {
                balance -= nextBet;
                balance += nextBet * diceRoll.payoutMultiplier;
            } else {
                newBalance = diceRoll.user.balances.filter((balance) => balance.available.currency === config.currency)[0];
                config.funds = {
                    available: newBalance.available.amount,
                    vault: newBalance.vault.amount,
                    currency: config.currency
                };

                balance = config.funds.available;
            }

            if (wagerMode === true && !win) {
                roundProfit = 0;
                wagerMode = false;
            }

            wager += nextBet;
            profit -= nextBet;
            roundProfit -= nextBet;
            bets++;
            lastHourBets.push(+new Date());

            if (betHigh) {
                win = diceRoll.state.result > diceRoll.state.target;
            } else {
                win = diceRoll.state.result < diceRoll.state.target;
            }

            if (win) {
                roundProfit += diceRoll.payout;
                profit += diceRoll.payout;

                if (currentStreak >= 0) {
                    currentStreak++;
                } else {
                    currentStreak = 1;
                }
            } else {
                if (currentStreak <= 0) {
                    currentStreak--;
                } else {
                    currentStreak = -1;
                }
            }

            console.log(
                win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
                [
                    'Stage: ' + stage,
                    'Balance: ' + balance.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Wager: ' + wager.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Profit: ' + profit.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Bet size: ' + nextBet.toFixed(8) + ' ' + config.currency.toUpperCase(),
                    'Current streak: ' + currentStreak,
                    'View bet: https://stake.com/?betId=' + diceRoll.id + '&modal=bet'
                ].join(' | ')
            );

            await doBet();

            previousBet = nextBet;
            if (currentStreak < 0) {
                highestLosingStreak = Math.max(highestLosingStreak, Math.abs(currentStreak));
            }

            await writeStatsFile();
            await new Promise(r => setTimeout(r, betDelay));
        } catch (e) {
            console.error('[ERROR]', e);

            if (!simulation) {
                config.funds = await apiClient.getFunds(config.currency);
                balance = config.funds.available;
            }
        }
    }
