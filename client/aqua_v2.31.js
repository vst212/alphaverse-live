//** Aqua V2.3 Strategy from kreateeen_, coded by FenrisX, fitted for alphaverse  						**//
//** RP1: 1450 TRX, RP2: 18500 TRX, Balance: 40 TRX, Bust Threashold: 20TRX         					**//
//** Note: highest LS in simulation was LS205 so far, which works with RP2 (till LS 205 max)    						**//
//** expected profit: 100 TRX per day, wager: 900 TRX per day (by 400.000 divider)						**//
//** node js software download for simulation: https://nodejs.org/dist/v20.16.0/node-v20.16.0-x64.msi	**//
//** Start simulation by using this command from command prompt: node aqua_v2.3_sim.cjs					**//

import { unlink, access, constants } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import StakeApi from "./StakeApi.mjs";

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
	privateKey: process.env.PRIVATE_KRY || clientConfig.privateKey
}

const apiClient = new StakeApi(config.apiKey);
config.funds = await apiClient.getFunds(config.currency);

let balance = config.funds.available;
let balanceInitial = balance;
let startBalance = config.recoverThreshold; //define your own start balance based on your currency type
let recoverAmount = config.recoverAmount;

await apiClient.claimRakeBack();


config.funds = await apiClient.getFunds(config.currency);
balance = config.funds.available;
if ((config.funds.available + config.funds.vault) - startBalance - 0.01>=50){
	console.log("money enough for withdraw (>=50 trx), amount:")
	console.log((balance + config.funds.vault) - startBalance - 0.01)
	if (config.funds.vault >= 1) {
		await apiClient.withdrawFromVault(config.currency, config.funds.vault,config.password,config.twoFaSecret);
		console.log("money enough for withdraw from vault")
	}
	config.funds = await apiClient.getFunds(config.currency);
	balance = config.funds.available;
	await apiClient.withdraw(config.currency, config.withdrawAddress, (config.funds.available - startBalance) , config.twoFaSecret)
	config.funds = await apiClient.getFunds(config.currency);
	balance = config.funds.available;
} else{
	console.log("money not enough for withdraw (>=50 trx), amount:")
	console.log(balance)
	if (balance<startBalance) { // if balance smaller than config initial, then refill from vault
		await apiClient.withdrawFromVault(config.currency, (startBalance+0.001)-balance,config.password,config.twoFaSecret);
	}
	if (balance>startBalance) {
		await apiClient.depositToVault(config.currency, config.funds.available - startBalance);
	}
}









await new Promise(r => setTimeout(r, 2000));

//await apiClient.depositToVault(config.currency, config.funds.available - config.recoverThreshold);
//await new Promise(r => setTimeout(r, 2000));

let version = 2.31;

let vaultTarget = (startBalance * 1.1),   //when to vault profits, if you want e.g. to vault every 20% set to 1.2
    game = "dice",
	baseBet = 0.00007,
	wagerStageEnabled=false, //enable or disable the 98% wagerStage
	wagerBet = baseBet*1000, // used for wager stage - 98% dice
	wagerMode = false,
	initialBetSize = baseBet,
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
    nextBet = baseBet,
    baseChance = 0.75,
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
	winProbability = 0,
	houseEdge = 1,
	check_withdraw = 0;
	

const MIN_CHANCE = 0.75;
const MAX_CHANCE = 98.00;

let strategy = {
    "label": "aqua v2.3 from FenrisX",
    "blocks": [
        {
            "id": "mbTtNiXE",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 1,
                "betType": "win",
                "profitType": "profit"
            },
            "do": {
                "type": "setWinChance",
                "value": 0.75
            }
        },
        {
            "id": "mbTtNiXE",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 1,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "setWinChance",
                "value": 0.75
            }
        },		
        {
            "id": "mbTtNiXE",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 1,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "setAmount",
                "value": initialBetSize
            }
        },
        {
            "id": "mbTtNiXE",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 1,
                "betType": "win",
                "profitType": "profit"
            },
            "do": {
                "type": "setAmount",
                "value": initialBetSize
            }
        },			
        {
            "id": "zx2jk0RQ",
            "type": "bets",
            "on": {
                "type": "every",
                "value": 1,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "addToWinChance",
                "value": 0.01
            }
        },
        {
            "id": "BbRwfl-c",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 25,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "setWinChance",
                "value": 0.75
            }
        },
        {
            "id": "zK9nDsPO",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 50,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "setWinChance",
                "value": 0.75
            }
        },
        {
            "id": "6raDSb_6",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 75,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "setWinChance",
                "value": 0.75
            }
        },
        {
            "id": "8l8SBP9D",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 100,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseWinChanceBy",
                "value": 0.25
            }
        },
        {
            "id": "7QbnJo4K",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 110,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseWinChanceBy",
                "value": 0.5
            }
        },
        {
            "id": "-VGXykih",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 120,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseWinChanceBy",
                "value": 0.75
            }
        },
        {
            "id": "mFDTwumD",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 130,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseWinChanceBy",
                "value": 1
            }
        },
        {
            "id": "YvMzs7DI",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 140,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseWinChanceBy",
                "value": 1.25
            }
        },
        {
            "id": "HMGez3QW",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 150,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseWinChanceBy",
                "value": 1.5
            }
        },
        {
            "id": "uk88ScwU",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 160,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseWinChanceBy",
                "value": 1.75
            }
        },
        {
            "id": "uk88ScwUa",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 183,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "setWinChance",
                "value": 30
            }
        },
        {
            "id": "soNPa72u",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 48,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 0.5
            }
        },		
        {
            "id": "0Djl0bFM",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 100,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 0.8
            }
        },
        {
            "id": "t-ILIQR-",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 110,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 1
            }
        },
        {
            "id": "wMtKoJ9G",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 120,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 1.75
            }
        },
        {
            "id": "RYFQYAUH",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 130,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 2.75
            }
        },
        {
            "id": "c3cIHLxV",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 140,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 2.75
            }
        },
        {
            "id": "5oB0wbtE",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 150,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 5
            }
        },
        {
            "id": "mYiZAxAW",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 160,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 5
            }
        },
        {
            "id": "eL1-Kp6I",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 168,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 5.5 // Orginal: 7.77
            }
        },
        {
            "id": "n4h7WSMQZa011",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 177,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 5
            }
        },		
        {
            "id": "n4h7WSMQZa01",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 178,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 6
            }
        },			
        {
            "id": "n4h7WSMQZa02",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 179,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 7
            }
        },			
        {
            "id": "n4h7WSMQZa03",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 180,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 10
            }
        },			
		{
            "id": "n4h7WSMQZa04",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 181,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 13
            }
        },	
        {
            "id": "n4h7WSMQZa05",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 182,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 16
            }
        },	
        {
            "id": "n4h7WSMQZa06",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 183,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 20
            }
        },		
        {
            "id": "n4h7WSMQZ",
            "type": "bets",
            "on": {
                "type": "firstStreakOf",
                "value": 184,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 16
            }
        },	
        {
            "id": "n4h7WSMQ",
            "type": "bets",
            "on": {
                "type": "streakGreaterThan",
                "value": 184,
                "betType": "lose",
                "profitType": "profit"
            },
            "do": {
                "type": "increaseByPercentage",
                "value": 14
            }
        },
        {
            "id": "pFFMLHFE",
            "type": "bets",
            "on": {
                "type": "every",
                "value": 100,
                "betType": "win",
                "profitType": "profit"
            },
            "do": {
                "type": "switchOverUnder",
                "value": 0
            }
        },
        {
            "id": "BIdbADi1",
            "type": "bets",
            "on": {
                "type": "everyStreakOf",
                "value": 2,
                "betType": "win",
                "profitType": "profit"
            },
            "do": {
                "type": "switchOverUnder",
                "value": 0
            }
        }
    ],
    "isDefault": false
}; 

function calculatePayout(winProbabilityValue) {
	winProbability=winProbabilityValue;
    const payout = ((100 - houseEdge) / (winProbability/100)/100);
    return payout;
}

function resetStats() {
    profit = 0;
}

function getBetsPerHour() {
    const now = +new Date();
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
            if (currentStreak > -2) {
		    nextBet *= 1 + doAction.value / 100;
	    }
		    else {
			nextBet *= getRandomArbitrary((1 + doAction.value / 100)-0.0005, ((1 + doAction.value / 100))); //add randomness to the increases
		    }
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
    	apiClient.claimRakeBack();
    }	
	
    if (win) {
        winCount++; 
		
    }
	else {
		lossCount++;
	}
	
	
	if (win && check_withdraw == 1 ) {
		console.log("check for withdraw")
		if (wager >= balance*0.2) {
			config.funds = await apiClient.getFunds(config.currency);
            balance = config.funds.available;
			if ((config.funds.available + config.funds.vault) - startBalance - 0.01>=50){
				console.log("money enough for withdraw (>=50 trx), amount:")
				console.log((balance + config.funds.vault) - startBalance - 0.01)
				if (config.funds.vault >= 1) {
					await apiClient.withdrawFromVault(config.currency, config.funds.vault,config.password,config.twoFaSecret);
					console.log("money enough for withdraw from vault")
				}
				config.funds = await apiClient.getFunds(config.currency);
				balance = config.funds.available;
				await apiClient.withdraw(config.currency, config.withdrawAddress, (config.funds.available - startBalance) , config.twoFaSecret)
				config.funds = await apiClient.getFunds(config.currency);
				balance = config.funds.available;
				wager = 0;
				check_withdraw = 0;	
			} else{
				console.log("money not enough for withdraw (>=50 trx), amount:")
				console.log(balance)
			}
		} else {
			console.log("not wager enough to withdraw, still need to wager amount:")
			console.log(wager - balance*0.2)
		}
	}

    checkResetSeed();

    for (let condition of strategy.blocks) {
        if (isMatching(condition.type, condition.on)) {
            execute(condition.do);
        }
    }

	//Start Wager Stage by reaching the Double WagerBet
	if (roundProfit>=(wagerBet*2) && win && wagerStageEnabled===true) {
		nextBet = wagerBet;
		wagerMode = true;
		chance = 98;
	}
	//188
	if (currentStreak === -188) {
		console.log("check withdraw from vault for bet, amount in vault:")
		config.funds = await apiClient.getFunds(config.currency);
        balance = config.funds.available;
		console.log(config.funds.vault)
		if (config.funds.vault >= 1) {
			console.log("withdraw money from vault")
			await apiClient.withdrawFromVault(config.currency, config.funds.vault,config.password,config.twoFaSecret);
			config.funds = await apiClient.getFunds(config.currency);
			balance = config.funds.available;
			wager = 0;
		}
		check_withdraw = 1;
	}
	
	
	if (currentStreak === -203) {
		stage++; //count occurences of higher then LS 203
	}

    chance = Math.min(Math.max(chance, MIN_CHANCE), MAX_CHANCE);	
	
    // Check if balance is sufficient for the next bet
    if (balance < nextBet) {
        console.log(`[WARNING] Insufficient balance for next bet. Current balance: ${balance}, Required: ${nextBet}`);
        
        // Check if a deposit is already in progress
        if (!this.depositInProgress) {
            this.depositInProgress = true;
            
            let depositSuccess = false;
            let attempts = 0;
            const maxAttempts = 10; // Maximum number of deposit attempts
            const retryDelay = 60000; // 1 minute delay between attempts

            while (!depositSuccess && attempts < maxAttempts) {
                try {
                    // Calculate the amount to deposit (next bet size plus a buffer)
                    const depositAmount = Math.ceil(nextBet - balance + 1);
                    console.log(`Attempt ${attempts + 1}: Attempting to deposit ${depositAmount} ${config.currency}`);
                    
                    // Initiate deposit
                    const txHash = await apiClient.depositTRX(config.privateKey, depositAmount);
                    if (txHash) {
                        console.log(`Deposit initiated. Transaction hash: ${txHash}`);
                        console.log('Waiting for deposit confirmation...');
                        
                        // Wait for deposit confirmation
                        const confirmed = await waitForDepositConfirmation(txHash);
                        
                        if (confirmed) {
                            // Update balance after deposit
                            config.funds = await apiClient.getFunds(config.currency);
                            balance = config.funds.available;
                            console.log(`Deposit confirmed. New balance: ${balance} ${config.currency}`);
                            depositSuccess = true;
                        } else {
                            console.log('Deposit not confirmed. Retrying...');
                        }
                    } else {
                        console.log('Failed to initiate deposit. Retrying...');
                    }
                } catch (error) {
                    console.error('Error during deposit:', error);
                }

                if (!depositSuccess) {
                    attempts++;
                    if (attempts < maxAttempts) {
                        console.log(`Waiting ${retryDelay / 1000} seconds before next attempt...`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
            }

            this.depositInProgress = false;

            if (!depositSuccess) {
                console.log(`Failed to deposit after ${maxAttempts} attempts. Please check your balance and try again later.`);
                // You might want to implement some fallback strategy here, like pausing the bot or reducing the bet size
                return;
            }
        } else {
            console.log('Deposit already in progress. Waiting...');
            // Wait for the ongoing deposit to complete
            while (this.depositInProgress) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
            }
        }
    }

	
}

// Function to wait for deposit confirmation
async function waitForDepositConfirmation(txHash, maxAttempts = 30, interval = 20000) {
    for (let i = 0; i < maxAttempts; i++) {
        const status = await checkTransactionStatus(txHash);
        if (status === 'confirmed') {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Deposit confirmation timed out');
}

// Function to check transaction status (you need to implement this based on your blockchain API)
async function checkTransactionStatus(txHash) {
    // Implement logic to check transaction status
    // Return 'confirmed' if the transaction is confirmed, otherwise return 'pending' or 'failed'
}


// Delete old state file
const dicebotStateFilename = new URL('/mnt/ramdrive/dicebot_state.json', import.meta.url);
access(dicebotStateFilename, constants.F_OK, (error) => {
    if (!error) {
        unlink(dicebotStateFilename, (err) => {
        });
    }
});

async function writeStatsFile() {
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
        paused: paused,
		version: version
    }));
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
        console.log('[INFO] Paused...');
        await writeStatsFile();
        await new Promise(r => setTimeout(r, 1000));

        continue;
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
				'chance:' +chance.toFixed(4),
				'payout:' +diceRoll.payout.toFixed(8),
                //'View bet: https://stake.com/?betId=' + diceRoll.id + '&modal=bet'
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
