const Telegraf = require('telegraf'); // Module to use Telegraf API.
const config = require('./config'); // Configuration file that holds telegraf_token API key.
const session = require('telegraf/session');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const rateLimit = require('telegraf-ratelimit');
var mongoose = require('mongoose');
const User = require('./user');
var ethereum_address = require('ethereum-address'); //used for verifying eth address

mongoose.connect(config.mongoURL, {
  socketTimeoutMS: 45000,
  keepAlive: true,
  poolSize: 10,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

// CONNECTION EVENTS
// When successfully connected
mongoose.connection.on('connected', function () {
  console.log('Mongoose default connection open to ');
});

// If the connection throws an error
mongoose.connection.on('error', function (err) {
  console.log('Mongoose default connection error: ' + err);
});

// When the connection is disconnected
mongoose.connection.on('disconnected', function () {
  console.log('Mongoose default connection disconnected');
});

// If the Node process ends, close the Mongoose connection
process.on('SIGINT', function () {
  mongoose.connection.close(function () {
    console.log('Mongoose default connection disconnected through app termination');
    process.exit(0);
  });
});

const buttonsLimit = {
  //sets a limit for user clicks
  window: 1000,
  limit: 1,
  onLimitExceeded: (ctx, next) => {
    if ('callback_query' in ctx.update)
      ctx.answerCbQuery('You`ve pressed buttons too oftern, wait.', true).catch((err) => sendError(err, ctx));
  },
  keyGenerator: (ctx) => {
    return ctx.callbackQuery ? true : false;
  },
};

//check connection

db.once('open', function () {
  console.log('connected to mongodb');
});
db.on('error', function (err) {
  console.log(err);
});

var refByNameAsync = function (ctx) {
  //finds and returns the name of the referrer
  return new Promise(function (resolve, reject) {
    try {
      var refBy = ctx.session.refBy;
      var findquery = {
        refNumber: refBy,
      };
      User.findOne(findquery, function (err, result) {
        if (err) throw err;
        if (result == null) {
          //if user doesn't exist
          ctx.session.refByName = '';
          resolve('ref by no one');
          return false;
        } else {
          //if user exists, return it's data
          ctx.session.refByName = result.telegramUser;
          resolve('ref by', ctx.session.refByName);
          console.log('Found TG USER REFFER BY:', ctx.session.refByName);
        }
      });
    } catch (e) {
      reject(e);
      console.log(e);
    }
  });
};

var checkDataAsync = function (ctx) {
  //checks the inputed user data
  return new Promise(function (resolve, reject) {
    try {
      if (ethereum_address.isAddress(ctx.session.eth.toString())) {
        resolve(true);
        return true;
      } else {
        resolve(false);
        return false;
      }
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

var findExistingAsync = function (ctx) {
  //finds existing members in the database
  return new Promise(function (resolve, reject) {
    try {
      console.log('FINDING EXISTING');
      var userID = ctx.from.id.toString();
      var findquery = {
        refNumber: userID,
      };
      User.findOne(findquery, function (err, result) {
        if (err) throw err;
        // console.log('Finding result', result);
        if (result == null) {
          resolve("ref user doesn't exist");
          //if user doesn't exist
          return false;
        } else {
          //returns data if user exists in
          console.log('DATA found!');
          var refNumber = ctx.session.refNumber;
          console.log('REF number in finding exisit:', refNumber);
          User.countDocuments(
            {
              refBy: refNumber,
            },
            function (err, count) {
              ctx.session.count = count;
              console.log('count is:', count);
            }
          );
          // console.log('result ===========', result);
          ctx.session.eth = result.ethAddress;
          ctx.session.twitter = result.twitterUser;
          ctx.session.refBy = result.refBy;
          ctx.session.refNumber = result.refNumber;
          ctx.session.username = result.telegramUser;
          ctx.session.retweet = result.retweet;
          ctx.session.joinTele = result.joinTele;
          ctx.session.followed = result.followed;
          ctx.session.found = '1';
          resolve('User found, returning');
        }
      });
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

var saveDataAsync = function (ctx) {
  //saves data to Mongodb
  return new Promise(function (resolve, reject) {
    try {
      console.log('SAVING DATA');
      var creationDate = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''); //cleans up creation date
      var ethAddress = ctx.session.eth.toString();
      var twitterUser = ctx.session.twitter.toString();
      var telegramUser = ctx.session.username.toString();
      var refNumber = ctx.session.refNumber.toString();
      var refBy = '0';
      var retweet = ctx.session.retweet;
      var joinTele = ctx.session.joinTele;
      var followed = ctx.session.followed;
      var binance = ctx.session.binance.toString();
      if (ctx.session.refBy != null) {
        refBy = ctx.session.refBy;
      } else {
        refBy = '0';
      }
      var findquery = {
        refNumber,
      };
      User.findOne(findquery, function (err, result) {
        console.log('FIND ONE');
        let myobj = new User({
          ethAddress,
          twitterUser,
          telegramUser,
          refNumber,
          refBy,
          creationDate,
          retweet,
          joinTele,
          followed,
        });

        if (err) {
          reject('error');
        }
        // console.log('finding result', result);
        if (result == null) {
          //if it doesn't find an existing user, saves the current data
          myobj.save(function (err) {
            if (err) {
              reject('error saving');
              console.log('Error while saving:', err);
              return;
            } else {
              resolve('Saved data');
              console.log('1 document inserted');
            }
          });
        } else {
          //if it finds an existing user, it updates the data
          User.findOneAndUpdate(
            {
              refNumber,
            },
            {
              $set: {
                ethAddress,
                twitterUser,
                telegramUser,
                refNumber,
                refBy,
                creationDate,
                retweet,
                joinTele,
                Binance,
                followed,
              },
            },
            {
              new: true,
            },
            (err, doc) => {
              if (err) {
                reject('error updating');
                console.log('error updating:', err);
              } else {
                resolve('Saved existing data');
                ctx.session.step = 6;
                // console.log(doc);
              }
            }
          );
        }
      });
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

//keyboard
const keyboard = Markup.inlineKeyboard([
  Markup.callbackButton('I have Registered', 'intro'),], {
  columns: 1,
});

function firstMessage(ctx) {
  var finalResult;

  finalResult = `👋Welcome @${ctx.session.username} to CypherCAT!`;
  finalResult += '\n';
  finalResult += '\n';
  finalResult +=
    '❗️Please register at @CypherFundBot to continue using this bot';
  finalResult += '\n';
  finalResult += '\n';
  finalResult += '📝By proceeding to use the bot, you confirm that you have read and agreed to our Terms and Service.';
  finalResult += '\n';
  finalResult += '🔏Cypherbot.tech ensures that your information will be treated confidentially.';
  finalResult += '\n';
  finalResult += '\n';
  finalResult +=
    'ⓒ 2023 CypherBOT, Tech.';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '1.📌 Submit your receiver ETH address.';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '2.📌 Submit your twitter username.';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '3.📌 Submit your retweet link';
  // finalResult += '\n';
  // finalResult += '\n';

  return finalResult;
}

async function check(ctx) {
  var finalResult;
  finalResult = '1. Submitted ERC20/BEP20 address';
  if (ctx.session.eth) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ❌';
  }
  finalResult += '\n';
  finalResult += '2. Submitted Twitter address';
  if (ctx.session.twitter) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ❌';
  }
  finalResult += '\n';

  finalResult += '3. Submitted retweet link';
  if (ctx.session.retweet) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ❌';
  }
  finalResult += '\n';

  return finalResult;
}

function makeMessage(ctx) {
  var finalResult;
  finalResult = '👤ID: ';
  finalResult += ctx.from.id;
  finalResult += '\n';
  finalResult += '🔑 ETH Address: ';
  finalResult += ctx.session.eth;
  finalResult += '\n';
  finalResult += '🐦 Twitter username: ';
  finalResult += ctx.session.twitter;
  finalResult += '\n';
  finalResult += '💰 Referral link: https://t.me/cyphercatbot?start=';
  finalResult += ctx.session.refNumber;
  finalResult += '\n';
  finalResult += '💵 Number of referrals: ';
  finalResult += ctx.session.count || '0';
  finalResult += '\n';
  finalResult += '👥 Referred by: ';
  finalResult += ctx.session.refByName || '';

  return finalResult;
}

async function initMessage(ctx) {
  if (ctx.session.found != '1') {
    ctx.session.eth = 'nil';
    ctx.session.twitter = 'nil';
    ctx.session.retweet = '0';
    ctx.session.joinTele = '0';
    ctx.session.followed = '0';
  } else {
    //values already set
  }
}

async function stepCheck(ctx) {
  //step check
  if (ctx.session.step == 2) {
    ctx.session.twitter = ctx.message.text;
    ctx.session.step = 3;
    ctx.reply('💲Please send your wallet address');
  } else if (ctx.session.step == 3) {
    if (ethereum_address.isAddress(ctx.message.text.toString())) {
      ctx.session.eth = ctx.message.text.toString();
      var keyboard = Markup.inlineKeyboard([Markup.callbackButton('✅Complete✅', 'intro')], {
        columns: 1,
      });
      ctx.telegram.sendMessage(
        ctx.from.id,
        'Hit ✅Complete✅ button to submit your registration.',
        Extra.HTML().markup(keyboard)
      );
    } else {
      ctx.reply('❗️Please input a valid wallet address!❗️');
    }
  } else {
    console.log('other data');
  }
}

//bot init
const bot = new Telegraf(config.telegraf_token); // Let's instantiate a bot using our token.
bot.use(session());
// bot.use(Telegraf.log());

bot.start(async (ctx) => {
  //bot start
  //parameter parsing
  ctx.session.refByName = '';
  ctx.session.count = 0;

  findExistingAsync(ctx).then(function (uid) {
    var len = ctx.message.text.length;
    if (ctx.from.username == null) {
      //user must have a valid username set.
      var nousrmsg = '❗️Please set a username first then contact the bot again!';
      ctx.telegram.sendMessage(ctx.from.id, nousrmsg);
    } else {
      ctx.session.username = ctx.from.username;
      var ref = ctx.message.text.slice(7, len);
      ctx.session.refBy = ref;
      if (ref.length != 0) {
        var refmsg = 'Referred by: ' + ctx.session.refBy;

        ctx.session.refNumber = ctx.from.id.toString();
        ctx.telegram.sendMessage(ctx.from.id, refmsg);
        console.log('refer', ctx.session.refBy);
      } else {
        ctx.session.refNumber = ctx.from.id.toString();
        console.log('session ref number:', ctx.session.refNumber);
      }
      //save referer
      ctx.session.telegram = ctx.message.chat.username;
      ctx.session.language = ctx.message.from.language_code;

      initMessage(ctx);
      var msg = firstMessage(ctx);
      // var msg = makeMessage(ctx);

      ctx.telegram.sendMessage(ctx.from.id, msg, Extra.markup(keyboard));
    }
  });
});

bot.on('message', async (ctx) => {
  //bot listens to any message
  if (ctx.from.username == null) {
    var nousrmsg = '❗️Please set a username first then contact the bot again!!!!!';
    ctx.telegram.sendMessage(ctx.from.id, ctx.from);
    ctx.telegram.sendMessage(ctx.from.id, nousrmsg);
  } else {
    console.log('sesison found in message:', ctx.session.found);
    ctx.session.refNumber = ctx.from.id.toString();
    if (ctx.session.found != '1') {
      findExistingAsync(ctx).then(function (uid) {
        //wait for promise to complete.
      });
    }
    console.log('ref by name', ctx.session.refByName);
    if (ctx.session.refByName == null) {
      //checks if refbyname exists, speeds up concurrent calls.
      refByNameAsync(ctx).then(function (uid) {
        stepCheck(ctx).then(function (a) {
          // var msg = makeMessage(ctx);
          // ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
        });
      });
    } else {
      stepCheck(ctx).then(function (a) {
        // var msg = makeMessage(ctx);
        // ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
      });
    }
  }
});

bot.telegram.getMe().then((bot_informations) => {
  bot.options.username = bot_informations.username;
  console.log('Server has initialized bot nickname. Nick: ' + bot_informations.username);
});

bot.action('delete', ({ deleteMessage }) => deleteMessage());

bot.action('eth', (ctx) => {
  //button click ETH
  ctx.reply('💲Please send your wallet address here.');
  ctx.session.step = 3;
});

bot.action('intro', (ctx) => {
  ctx.session.step = 1;
  var msg = '🤖<b>Make sure you are followed our X/Twitter and joined our Telegram group to continuesly using this bot.</b>';
  msg += '\n';
  msg += '\n';
  msg +=
    '✅Follow us on <a href="https://twitter.com/cypherbottech">X</a>';
  msg += '\n';
  msg += '✅Join our <a href="https://t.me/cypherbotofficial">Telegram</a> Group';
  msg += '\n';
  msg += '\n';
  msg += '<a href="https://twitter.com/cypherbottech">🌐CypherBOT</a>';
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('🔥Start Journey🔥', 'Journey')], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//Journey
bot.action('Journey', (ctx) => {
  var msg = '🔥<b>Here You Go!</b>🔥';
  msg += '\n';
  msg += '\n';
  msg += '👇Select one of the trade types you want👇';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('CopyTrade Influencer', 'influencerlist'),
    Markup.callbackButton('CopyTrade CypherBOT AI', 'cypherbotai'),
    Markup.callbackButton('Cex (Spot Trade)', 'cexlist'),
    Markup.callbackButton('Dex (Swap Trade)', 'dexlist'),
    Markup.callbackButton('Cex (Future Trade)', 'cexlist'),
    Markup.callbackButton('Dex (Liq Trade)', 'dexlist'),
    Markup.callbackButton('Cex (Sniper)', 'cexlist'),
    Markup.callbackButton('Dex (Sniper)', 'dexlist'),
    Markup.callbackButton('More', 'more'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//influencerlist
bot.action('influencerlist', (ctx) => {
  var msg = '👇Select the influencer you want to copy to get started👇';
  msg += '\n'
  msg += '\n'
      msg += '✅ Available Copy Trade';
      msg += '\n'
      msg += '❌ Unavailable Copy Trade';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('STAR LORD✅', 'tradeopt'),
    Markup.callbackButton('ROCKET❌', 'comingsoon'),
    Markup.callbackButton('GAMORA❌', 'comingsoon'),
    Markup.callbackButton('NEBULA❌', 'comingsoon'),
    Markup.callbackButton('YONDU❌', 'comingsoon'),
    Markup.callbackButton('DRAKE❌', 'comingsoon'),
    Markup.callbackButton('MANTIS❌', 'comingsoon'),
    Markup.callbackButton('GROOT❌', 'comingsoon'),
    Markup.callbackButton('THOR❌', 'comingsoon'),
    Markup.callbackButton('LOKI❌', 'comingsoon'),
    Markup.callbackButton('◀️ More ▶️', 'more'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//starlord
bot.action('starlord', (ctx) => {
  var msg = '🔥Here are upto date data from STARLORD🔥';
      msg += '\n';
      msg += '\n';
      msg += '<b>TF: 5 MINUTES</b>';
      msg += '\n';
      msg += '📊CRYPTO IDX';
      msg += '\n';
      msg += '01.00	BUY🟢';
      msg += '\n';
      msg += '02.00	BUY🟢';
      msg += '\n';
      msg += '03.00	SELL🔴';
      msg += '\n';
      msg += '04.00	BUY🟢';
      msg += '\n';
      msg += '05.00	SELL🔴';
      msg += '\n';
      msg += '06.00	SELL🔴';
      msg += '\n';
      msg += '07.00	BUY🟢';
      msg += '\n';
      msg += '08.00	BUY🟢';
      msg += '\n';
      msg += '09.00	BUY🟢';
      msg += '\n';
      msg += '10.00	SELL🔴';
      msg += '\n';
      msg += '11.00	BUY🟢';
      msg += '\n';
      msg += '12.00	BUY🟢';
      msg += '\n';
      msg += '\n';
      msg += '<b>TF: 5 MINUTES</b>';
      msg += '\n';
      msg += '📊EUR USD';
      msg += '\n';
      msg += '01.00 SELL🔴';
      msg += '\n';
      msg += '02.00 BUY🟢';
      msg += '\n';
      msg += '03.00 SELL🔴';
      msg += '\n';
      msg += '04.00 SELL🔴';
      msg += '\n';
      msg += '05.00 BUY🟢';
      msg += '\n';
      msg += '06.00 BUY🟢';
      msg += '\n';
      msg += '07.00 BUY🟢';
      msg += '\n';
      msg += '08.00 SELL🔴';
      msg += '\n';
      msg += '09.00 BUY🟢';
      msg += '\n';
      msg += '10.00 SELL🔴';
      msg += '\n';
      msg += '11.00 BUY🟢';
      msg += '\n';
      msg += '12.00 BUY🟢';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//tradeopt
bot.action('tradeopt', (ctx) => {
  var msg = '👇Please Select Trade Options👇';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🙍🏻‍♂️Manual', 'starlord'),
    Markup.callbackButton('🤖CypherCat AI', 'cypherbotai'),
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//more
bot.action('more', (ctx) => {
  var msg = '🔥🔥More options are <b>COMING SOON!!!</b>🔥🔥';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//cypherbotai
bot.action('cypherbotai', (ctx) => {
  var msg = '👇Select the mode you want to do with <b>CypherBOT AI</b>👇';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('🤖Auto Mode🤖', 'wait'),
    Markup.callbackButton('🦾Semi Auto Mode🦿', 'btc'),
  Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//cexlist
bot.action('cexlist', (ctx) => {
  var msg = '👇Select the CEX you want to get started👇';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('BINANCE', 'binanceopt'),
    Markup.callbackButton('OKX', 'binanceopt'),
    Markup.callbackButton('MEXC', 'binanceopt'),
    Markup.callbackButton('BYBIT', 'binanceopt'),
    Markup.callbackButton('KUCOIN', 'binanceopt'),
    Markup.callbackButton('BITGET', 'binanceopt'),
    Markup.callbackButton('BITMART', 'binanceopt'),
    Markup.callbackButton('GATE.IO', 'binanceopt'),
    Markup.callbackButton('DERIBIT', 'binanceopt'),
    Markup.callbackButton('KRAKEN', 'binanceopt'),
    Markup.callbackButton('BITMART', 'binanceopt'),
    Markup.callbackButton('BITFINEX', 'binanceopt'),
    Markup.callbackButton('HUOBI', 'binanceopt'),
    Markup.callbackButton('BITMEX', 'binanceopt'),
    Markup.callbackButton('More', 'more'),], {
    columns: 2,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

//binanceopt
bot.action('binanceopt', (ctx) => {
  var msg = '❗️Make sure once again your choices!';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('❗️Future Trade❗️', 'future'),
    Markup.callbackButton('❗️Spot Trade❗️', 'spot'),
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//spot Trade
bot.action('spot', (ctx) => {
  var msg = '👇Select available coin/token👇';
      msg += '\n'
      msg += 'More coin/token are comingsoon';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('BTC', 'btc'),
    Markup.callbackButton('ETH', 'btc'),
    Markup.callbackButton('BNB', 'btc'),
    Markup.callbackButton('AVAX', 'btc'),
    Markup.callbackButton('XRP', 'btc'),
    Markup.callbackButton('LTC', 'btc'),
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//btc
bot.action('btc', (ctx) => {
  var msg = '👇What percentage of the total balance do you want to use on this trade?👇';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('10%', 'cross'),
    Markup.callbackButton('20%', 'cross'),
    Markup.callbackButton('30%', 'cross'),
    Markup.callbackButton('40%', 'cross'),
    Markup.callbackButton('50%', 'cross'),
    Markup.callbackButton('60%', 'cross'),
    Markup.callbackButton('70%', 'cross'),
    Markup.callbackButton('80%', 'cross'),
    Markup.callbackButton('90%', 'cross'),
    Markup.callbackButton('100%', 'cross'),
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//future Trade
bot.action('future', (ctx) => {
  var msg = '👇Select available coin👇';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('BTC', 'btcopt'),
    Markup.callbackButton('ETH', 'btcopt'),
    Markup.callbackButton('BNB', 'btcopt'),
    Markup.callbackButton('AVAX', 'btcopt'),
    Markup.callbackButton('XRP', 'btcopt'),
    Markup.callbackButton('LTC', 'btcopt'),
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//btcopt
bot.action('btcopt', (ctx) => {
  var msg = '👇Select margin type!👇';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('❌Cross❌', 'margin'),
    Markup.callbackButton('❎Isolated❎', 'margin'),
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//margin
bot.action('margin', (ctx) => {
  var msg = '👇Select total margin trade!👇';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('10%', 'leverage'),
    Markup.callbackButton('20%', 'leverage'),
    Markup.callbackButton('30%', 'leverage'),
    Markup.callbackButton('40%', 'leverage'),
    Markup.callbackButton('50%', 'leverage'),
    Markup.callbackButton('60%', 'leverage'),
    Markup.callbackButton('70%', 'leverage'),
    Markup.callbackButton('80%', 'leverage'),
    Markup.callbackButton('90%', 'leverage'),
    Markup.callbackButton('100%', 'leverage'),
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//leverage
bot.action('leverage', (ctx) => {
  var msg = '👇Select Leverage!👇';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('10x', 'cross'),
    Markup.callbackButton('25x', 'cross'),
    Markup.callbackButton('50x', 'cross'),
    Markup.callbackButton('75x', 'cross'),
    Markup.callbackButton('100x', 'cross'),
    Markup.callbackButton('125x', 'cross'),
    Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//cross
//cross
//cross
//cross
//cross
//cross125
bot.action('cross', (ctx) => {
  var msg = '❗️Confirm this transactions❗️';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('✅Confirm✅', 'wait'),
    Markup.callbackButton('❌Cancel❌', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//wait
bot.action('wait', (ctx) => {
  var msg = '✅Order Received! Our 🤖CypherBOT AI Trade is working on your order.';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('✔️ Check Status ✔️', 'status'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//status
bot.action('status', (ctx) => {
  var msg = '⭕️Please wait!⭕️';
  var keyboard = Markup.inlineKeyboard([ 
    Markup.callbackButton('🔄Refresh!🔄', 'status'),
    Markup.callbackButton('🔥Main Menu🔥', 'Journey'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

  //dexlist
bot.action('dexlist', (ctx) => {
  var msg = '👇Select the DEX you want to get started👇';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('dYdX', 'more'),
    Markup.callbackButton('Uniswap ARB', 'more'),
    Markup.callbackButton('Kine Protocol Matic', 'more'),
    Markup.callbackButton('Uniswap ETH', 'more'),
    Markup.callbackButton('Pancake BSC', 'more'),
    Markup.callbackButton('Curve', 'more'),
    Markup.callbackButton('Apex Protocol', 'more'),
    Markup.callbackButton('DODO BSC', 'more'),
    Markup.callbackButton('DODO ETH', 'more'),
    Markup.callbackButton('BaseSwap', 'more'),
    Markup.callbackButton('OpenOcean', 'more'),
    Markup.callbackButton('ApolloX', 'more'),
    Markup.callbackButton('KlaySwap', 'more'),
    Markup.callbackButton('SushiSwap', 'more'),
    Markup.callbackButton('More', 'more'),], {
    columns: 2,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  bot.action('comingsoon', (ctx) => {
    var msg = '❗️Sorry! You must have at least one <b>cBot License</b> to use this bot!!!';
        msg += '\n'
        msg += '\n'
        msg += '<i>ⓒ 2023 CypherBOT, Tech.</i>'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

bot.action('twitter', (ctx) => {
  //button click twitter
  ctx.session.step = 2;
  ctx.reply('Submit your email address!');
});

bot.action('moma', (ctx) => {
  ctx.session.step = 3;
  ctx.reply('Please send your multichain wallet address');
});

bot.action('refresh', (ctx) => {
  //button click refresh data
  var msg = makeMessage(ctx);
  refByNameAsync(ctx).then(function (uid) {
    findExistingAsync(ctx).then(function (uid) {
      ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
      ctx.reply('Data has been refreshed!');
    });
  });
});

bot.action('check', async (ctx) => {
  try {
    let user = await ctx.getChatMember(ctx.from.id, '');
    if (user && !user.is_bot) {
      ctx.session.joinTele = '1';
    }
  } catch (e) {
    console.log(e);
  }
  var msg = await check(ctx);
  var info = makeMessage(ctx);
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('Submit ✅', 'intro')], {
    columns: 1,
  });
  ctx.telegram.sendMessage(ctx.from.id, info + '\n \n' + msg, Extra.HTML().markup(keyboard));
});

bot.action('confirm', (ctx) => {
  //button click confirm
  checkDataAsync(ctx).then(function (uid) {
    var check = uid;
    console.log('CHECK', check);
    // refByNameAsync(ctx).then(function (uid) {
    //   if (check == true) {
    saveDataAsync(ctx).then(function (uid) {
      var msg;
      msg = 'Please Wait';
      // msg += '\n';
      // msg += 'Please use this referral link';
      // msg += '\n';
      // msg += 'https://t.me/cyphercatbot?start=';
      // msg += ctx.session.refNumber;
      msg += '\n';
      msg +=
        'Bot is Fully Loaded';
      ctx.reply(msg);
    });
    // } else {
    //   ctx.reply('Please input all data');
    // }
    // });
  });
});
bot.use(rateLimit(buttonsLimit));
bot.startPolling(); //MUST HAVE
