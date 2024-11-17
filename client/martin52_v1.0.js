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
    wagerStageRemaining = -1,
    lastDepositAttempt = 0,
    totalDeposited = 0,
    DEPOSIT_COOLDOWN = 2 * 60 * 1000, // 2 minutes
    MANUAL_INTERVENTION_THRESHOLD = 999;

let apiClient = new StakeApi(config.apiKey);

async function initializeFunds() {
    while (true) {
        try {
            config.funds = await apiClient.getFunds(config.currency);
            if (!config.funds) {
                console.error('[ERROR] Failed to fetch initial funds, retrying in 5 seconds...');
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            console.log('[INFO] Successfully initialized with funds:', config.funds);
            break;
        } catch (error) {
            console.error('[ERROR] Failed to initialize StakeApi:', error);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

await initializeFunds();

// Initialize bot state variables
let balance = config.funds.available,
    version = 1.01,
    game = "dice",
    baseBet = 0.000063, // baseBet: 0.0001 TRX (minimum Bet)
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
        if (config.funds.vault > 0) {
            console.log("withdraw money from vault");
            await apiClient.withdrawFromVault(config.currency, config.funds.vault - 0.00000001, config.password, config.twoFaSecret);
            console.log("Waiting for 2FA renewal...");
            await new Promise(resolve => setTimeout(resolve, 30000));
        }

        balance = config.funds.available + config.funds.vault - 0.00000001;
        config.funds.vault = 0.00000001;

        try {
            await apiClient.claimRakeBack();
            console.log(`claimRakeBack success`);
        } catch {
            console.log(`claimRakeBack error`);
        }

        try {
            await apiClient.claimReload(config.currency);
            console.log(`claimReload success`);
        } catch {
            console.log(`claimReload error`);
        }

        const totalAvailable = (balance + config.funds.vault) - startBalance - 0.01;
        const withdrawAmount = Math.floor(totalAvailable);

        if (balance < startBalance) {
            const depositAmount = startBalance - balance + 0.001;
            console.log(`Balance (${balance}) is less than start balance (${startBalance}). Depositing ${depositAmount} to reach start balance.`);

            try {
                lastDepositAttempt = Date.now();
                const txHash = await apiClient.depositTRX(config.privateKey, depositAmount, config.depositAddress);
                if (txHash) {
                    console.log(`[INFO] Deposited ${depositAmount}. Transaction hash: ${txHash}`);
                    console.log('[INFO] Waiting for deposit confirmation...');
                    totalDeposited += depositAmount;

                    while (true) {
                        await new Promise(resolve => setTimeout(resolve, 20000));
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
        }

        config.funds = await apiClient.getFunds(config.currency);
        balance = config.funds.available;
    } catch (e) {
        console.error('[ERROR]', e);
    }
}

await initialSetup();

function getBetsPerHour() {
    const now = Date.now();
    lastHourBets = lastHourBets.filter((timestamp) => now - timestamp <= 60 * 60 * 1000);
    return lastHourBets.length;
}

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
    if (seedChangeFlag === true && currentStreak > -1) {
        seedChangeFlag = false;
        apiClient.resetSeed();
    }
}

async function doBet() {
    if (bets % 10000 === 0) {
        try {
            await apiClient.claimRakeBack();
            console.log(`claimRakeBack success`);
        } catch {
            console.log(`claimRakeBack error`);
        }
    }

    if (bets % 300000 === 0) {
        try {
            await apiClient.claimReload(config.currency);
            console.log(`claimReload success`);
        } catch {
            console.log(`claimReload error`);
        }
    }

    if (win) {
        winCount++;
    } else {
        lossCount++;
    }

    if (win && check_withdraw === 1) {
        if (wagerStageRemaining === -1) {
            while (true) {
                try {
                    if ((config.funds.available + config.funds.vault) - startBalance - 0.01 >= 20) {
                        console.log("money enough for withdraw (>=20), amount:");
                        console.log((balance + config.funds.vault) - startBalance - 0.01);
                        if (config.funds.vault >= 1) {
                            await apiClient.withdrawFromVault(config.currency, config.funds.vault, config.password, config.twoFaSecret);
                            console.log("money enough for withdraw from vault");
                            console.log("Waiting for 2FA renewal...");
                            await new Promise(resolve => setTimeout(resolve, 30000));
                        }
                        config.funds = await apiClient.getFunds(config.currency);
                        balance = config.funds.available;
                        console.log("check for amount to wager");
                        config.funds = await apiClient.getFunds(config.currency);
                        balance = config.funds.available;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        wagerStageRemaining = Math.round(balance * 0.22 / wagerBet);
                        console.log(`Need to wager for ${wagerStageRemaining}`);
                    } else {
                        console.log("money not enough for withdraw (>=20), amount:");
                        console.log(balance);
                        check_withdraw = 0;
                    }
                    break;
                } catch {
                    console.log(`Error in check for amount to wager, retry after 10 second`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                }
            }
        } else {
            console.log("check for wagerStageRemaining");
            if (wagerStageRemaining > 0) {
                console.log(`still need to wager for ${wagerStageRemaining} times`);
                wagerStageRemaining--;
            } else {
                console.log("wager enough to withdraw");
                config.funds = await apiClient.getFunds(config.currency);
                balance = config.funds.available;
                console.log(`Going to withdraw ${config.funds.available - startBalance}`);
                await apiClient.withdraw(config.currency, config.withdrawAddress, config.funds.available - startBalance, config.twoFaSecret);
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

    if (win) {
        nextBet = 0;
    } else {
        nextBet *= 2.11;
        if (currentStreak <= 11) {
            nextBet *= (1 + (-(currentStreak - 1) / 100));
        }
        if (currentStreak === -5) {
            nextBet = baseBet;
        }
        if (wagerStageRemaining >= 0) {
            nextBet = wagerBet;
            chance = 51;
        }
        if (balance >= 50) {
            console.log("check withdraw from vault for bet, amount in vault:");
            check_withdraw = 1;
        }
        chance = Math.min(Math.max(chance, MIN_CHANCE), MAX_CHANCE);
    }
}

const dicebotStateFilename = new URL('/mnt/ramdrive/dicebot_state.json', import.meta.url);
access(dicebotStateFilename, constants.F_OK, (error) => {
    if (!error) {
        unlink(dicebotStateFilename, (err) => {
            if (err) console.error('[ERROR] Failed to delete old state file:', err);
            else console.log('[INFO] Old state file deleted.');
        });
    }
});

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

                while (true) {
                    await new Promise(resolve => setTimeout(resolve, 10000));
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
        paused = false; // Set this according to your needs
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
        pauseLogged = false;
    }

    try {
        diceRoll = await apiClient.diceRoll(chance, betHigh, simulation ? 0 : nextBet, config.currency).then(async (result) => {
            if (!result) {
                console.error('[ERROR] No result from diceRoll API.');
                return null;
            }
            try {
                const data = JSON.parse(result);
                if (data.errors) {
                    console.error('[ERROR] Dicebet response: ', data.errors);
                    if (data.errors[0].errorType === 'insufficientBalance') {
                        await checkAndRefillBalance();
                    }
                    if (data.errors[0].errorType === 'insignificantBet') {
                        baseBet += 0.000001;
                    }
                    return null;
                }
                return data.data.diceRoll;
            } catch (e) {
                console.error('[ERROR] Failed to parse diceRoll response:', e);
                return null;
            }
        }).catch(error => {
            console.error('[ERROR] API call failed:', error);
            return null;
        });

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
            newBalance = diceRoll.user.balances.find((balance) => balance.available.currency === config.currency);
            if (newBalance) {
                config.funds = {
                    available: newBalance.available.amount,
                    vault: newBalance.vault.amount,
                    currency: config.currency
                };
                balance = config.funds.available;
            }
        }

        if (wagerMode && !win) {
            roundProfit = 0;
            wagerMode = false;
        }

        wager += nextBet;
        profit -= nextBet;
        roundProfit -= nextBet;
        bets++;
        lastHourBets.push(Date.now());

        win = betHigh ? diceRoll.state.result > diceRoll.state.target : diceRoll.state.result < diceRoll.state.target;

        if (win) {
            roundProfit += diceRoll.payout;
            profit += diceRoll.payout;
            currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
        } else {
            currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
        }

        console.log(
            win ? '\x1b[32m%s\x1b[0m' : '\x1b[37m%s\x1b[0m',
            [
                'Stage: ' + stage,
                'Balance: ' + balance.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Wager: ' + wager.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Profit: ' + profit.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Bet size: ' + nextBet.toFixed(8) + ' ' + config.currency.toUpperCase(),
                'Current streak: ' + currentStreak
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
    }
}
