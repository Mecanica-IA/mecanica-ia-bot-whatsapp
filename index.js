import pino from "pino";
import chalk from "chalk";
import readline from "readline";
import moment from "moment-timezone";
import util from "util";
import cp, { exec as _exec } from "child_process";
let exec = util.promisify(_exec).bind(cp);
const {
  default: makeWAclient,
  useMultiFileAuthState,
  delay,
  PHONENUMBER_MCC,
  getContentType,
  jidNormalizedUser,
  makeInMemoryStore,
} = await (await import("@whiskeysockets/baileys")).default;
import serialize, { Client } from "./lib/serialize.js";
import OpenAI from 'openai';
import { waitForRunCompletion } from './helpers/wait-run.js';

const AssistantStatus = {
  QUEUED : "queued",
  RUNNING : "running",
  REQUIRES_ACTION : "requires_action",
  CANCELLING : "cancelling",
  CANCELLED : "cancelled",
  FAILED : "failed",
  COMPLETED : "completed",
  EXPIRED : "expired",
}

let dbTemp = []
function cleanText(text) {
  // Remove qualquer referência a documentos, como por exemplo "[20:0†Documento sem título(2).docx]"
  return text.replace(/【[^】]*】/g, '').trim();
}

const askIA = async (message, threadId = false) => {
  const openai = new OpenAI({ apiKey: 'sk-proj-wyINX5f4OxGkas68ijO2T3BlbkFJrPQNDNZmbcmIon8sedHV' });
    const assistant_id = 'asst_XOAKXvvil1ghEvcTQku92QL8';

    let thread = {id: threadId}
    if(!threadId){
      thread = await openai.beta.threads.create();
    }
    await openai.beta.threads.messages.create(thread.id, { role: "user", content: message, });

    const run = await openai.beta.threads.runs.create(
      thread.id,
      { assistant_id: assistant_id },
    );

    const completedRun = await waitForRunCompletion(openai, thread.id, run.id);
    if (completedRun === AssistantStatus.FAILED) {
      throw new BadRequestException('Erro ao consultar a IA');
    }

    const messages = await openai.beta.threads.messages.list(thread.id);

    let assistantResponse = messages?.data.find((message) => message.role === "assistant")?.content;
    let mensagemFinal = ''
    if(assistantResponse.length > 0){
      mensagemFinal = cleanText(assistantResponse[0]?.text?.value);
    }else{
      mensagemFinal = 'nao entendi'
    }
    
    const result = {
      question: message,
      answer: mensagemFinal,
      threadId: thread.id
    }

    return result
}





function getJakartaDateTime() {
  return moment.tz("Brazil/Sao-Paulo").format("YYYY-MM-DD HH:mm:ss");
}

global.sessionName = "mecanico2";
const pairingCode = process.argv.includes("--use-pairing-code");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const logger = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
}).child({ class: "client" });
logger.level = "fatal";
const store = makeInMemoryStore({ logger });

async function Maelyn2() {
  const { state, saveCreds } = await useMultiFileAuthState("./" + sessionName);
  try {
    const client = makeWAclient({
      printQRInTerminal: !pairingCode,
      logger,
      logger: pino({
        level: "silent",
      }),
      browser: ["Mac OS", "chrome", "121.0.6167.159"],
      auth: state,
    });

    store.bind(client.ev);
    await Client({ hisoka: client, store });

    client.ev.on(
      "connection.update",
      async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          try {
            const dateTime = getJakartaDateTime();
            await client.sendMessage(client.user.id, {
              text: `WhatsApp Bot Connected ${dateTime}`,
            });
            console.log(chalk.greenBright("WhatsApp bot connected!"));
          } catch (error) {
            console.error("Error sending file:", error);
            process.exit(1);
          }
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          Maelyn2();
        }
      },
    );

    client.ev.on("creds.update", saveCreds);

    if (pairingCode && !client.authState.creds.registered) {
      let phoneNumber;
      phoneNumber = await question(
        chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number : `)),
      );
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

      if (
        !Object.keys(PHONENUMBER_MCC).some((v) => phoneNumber.startsWith(v))
      ) {
        console.log(
          chalk.bgBlack(
            chalk.redBright("Start with your country's WhatsApp code!"),
          ),
        );
        phoneNumber = await question(
          chalk.bgBlack(
            chalk.greenBright(`Please type your WhatsApp number : `),
          ),
        );
        phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
        rl.close();
      }

      setTimeout(async () => {
        try {
          let code = await client.requestPairingCode(phoneNumber);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(
            chalk.black(chalk.bgGreen(`Your Pairing Code : `)),
            chalk.black(chalk.white(code)),
          );
        } catch (error) {
          console.error("Error requesting pairing code:", error);
          process.exit(1);
        }
      }, 3000);
    }


    client.ev.on("messages.upsert", async ({ messages }) => {
      try {
        if (!messages[0].message) return;
        let m = await serialize(client, messages[0], store);

        let quoted = m.isQuoted ? m.quoted : m;
        // let downloadM = async (filename) =>
        //   await client.downloadMediaMessage(quoted, filename);

        if (m.isBot) return;
        if(m.isGroup) return;
        console.log('Nova mensagem do numero: ' + m.from)
        // if(m.body.startsWith('!')){
          if (/image/i.test(quoted.msg.mimetype)) {
            return await client.sendMessage(m.from, {
              text: 'Não consigo baixar essa imagem, pode escrever?',
              quoted: quoted,
            });
          } else {
            const db = dbTemp.find((a) => a.number === m.from)
            if(db){
              const response = await askIA(
                m.body,
                db.threadId
              );
              await client.sendMessage(m.from, { text: response.answer });
            }else{
              const response = await askIA(
                m.body
              );
              dbTemp.push({
                number: m.from,
                threadId: response.threadId
              })
              await client.sendMessage(m.from, { text: response.answer });
            }
            

           

            
          }
        // }



      } catch (err) {
        console.log(err);
      }
    });
  } catch (error) {
    console.error("Error in Maelyn:", error);
  }
}

Maelyn2();
