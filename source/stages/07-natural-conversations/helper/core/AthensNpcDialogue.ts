/** Spoken dialogue for the existing dialogue bridge. No simulation or save owner.
 * A line answers the player's last remark; information belongs behind a question.
 * Keep reconstruction notes in their explicitly labelled read-only displays. */
type Choice={label:string;next?:string|null};
type Turn={text:string;options:Choice[]};
type Conversation=Record<string,Turn>;
const bye=(label="I'll let you get on."):Choice=>({label,next:null});
const say=(label:string,next:string):Choice=>({label,next});
const turn=(text:string,...options:Choice[]):Turn=>({text,options});

const PHILOSOPHERS:Record<string,Conversation>={
 socrates:{
  start:turn('Yes? Did you want to ask me something?',say('People say you never give a straight answer.','answers'),say('What makes a person good?','good'),bye('No. Sorry to interrupt.')),
  answers:turn("Do they? Perhaps they haven't given me a question I can answer yet.",say('That sounds like another way of avoiding it.','avoid'),say('Then let me try. What makes a person good?','good'),bye()),
  avoid:turn("Fair enough. Ask me something, and we'll see how far we get.",say('Can someone know what is right and still do wrong?','knowing'),bye('Another time, perhaps.')),
  good:turn('Good at something, or a good person? A thief can be good at stealing.',say('A good person. Someone who does what is right.','knowing'),say("I hadn't thought of that difference.",'difference'),bye()),
  knowing:turn("Suppose someone knows what is right but is frightened to do it. What's missing?",say('Courage. Knowing is not enough.','courage'),say("Perhaps they don't really understand it.",'understand'),bye()),
  courage:turn("Then we'd better ask what courage is. Reckless people aren't always wise, are they?",say("No. They might not understand the danger.",'difference'),bye("I'll think about that.")),
  understand:turn("That may be it. But how would you tell whether they've understood, rather than merely repeated the words?",say('By what they do.','difference'),bye("I don't know yet.")),
  difference:turn("That's something to keep thinking about. Come back when you have another answer.",bye('I will.')),
 },
 plato:{
  start:turn('Were you looking for me?',say('I wanted to ask you about appearances.','appearances'),say('What would make a city well governed?','city'),bye('No, just passing.')),
  appearances:turn("Have you ever been quite sure of something, then found you'd misunderstood it?",say('Often enough.','mistake'),say('Are you saying we cannot trust what we see?','seeing'),bye()),
  mistake:turn('What changed your mind: looking again, or someone asking the right question?',say('Someone made me look at it differently.','seeing'),bye("I'll have to think about that.")),
  seeing:turn("We need our eyes. But we also need to ask what we're looking at. The first impression isn't always enough.",say('And that applies to running a city?','city'),bye('I see what you mean.')),
  city:turn('Who would you trust with it: someone who wants the power, or someone who understands the work?',say('Understanding the work does not guarantee honesty.','honesty'),say('Someone who understands it.','honesty'),bye()),
  honesty:turn("No simple choice, is it? A ruler's character matters as much as their cleverness.",bye("That's what worries me.")),
 },
 aristotle:{
  start:turn('What caught your attention on the way here?',say('Everyone seems to be working at something different.','work'),say('I was wondering what you mean by living well.','life'),bye("Nothing in particular. I'll leave you to it.")),
  work:turn('Take a potter. What makes a good pot?',say('It does the job it was made for.','purpose'),say('It looks beautiful.','beauty'),bye()),
  beauty:turn('And if it leaks? Would you still call it a good water jar?',say('No. It has to do its job as well.','purpose'),bye('Perhaps not.')),
  purpose:turn('Now try asking the same question about a person. That is where it gets harder.',say('Because people do more than one thing.','life'),bye("I'll think about it.")),
  life:turn("You wouldn't judge a whole life by one pleasant afternoon. What someone keeps doing matters.",say('So it is a matter of habit?','habit'),bye('That seems fair.')),
  habit:turn('Habit, judgment, and practice. Saying the right thing is easier than doing it day after day.',bye('Yes. It is.')),
 },
 diogenes:{
  start:turn("You're in my light.",say('Sorry. I wanted to ask you something.','question'),say('You could ask more politely.','polite'),bye("I'll move.")),
  polite:turn('Would a polite voice make the shade any smaller?',bye('All right. Point taken.'),say('Why do you live with so little?','needs')),
  question:turn('Well? Out with it.',say('Why do you live with so little?','needs'),say('What is the lantern for?','lantern'),bye("Never mind.")),
  needs:turn('Less to carry. Less to lose. What would you miss if you put half your possessions down?',say('Some of it is useful.','useful'),bye("I'm not sure.")),
  useful:turn("Then keep what's useful. Be honest about how much that is.",bye('Fair enough.')),
  lantern:turn("I'm looking for an honest person. Have you seen one?",say('You are talking to one.','honest'),bye('I will keep an eye out.')),
  honest:turn("Good. Then you'll admit you can't expect me to take your word for it.",bye('You make this difficult.')),
 },
};

/** A small authored exchange, reused by people doing the same trade. Different
 * trades have different concerns; it is not a location-guide paragraph. */
function worker(opening:string,question:string,answer:string,follow:string,reply:string):Conversation{
 return{start:turn(opening,say(question,'work'),bye('Nothing, thanks. Just looking.')),
 work:turn(answer,say(follow,'more'),bye()),more:turn(reply,bye('Thanks. I will leave you to it.'))};
}
const PROFILES:[RegExp,Conversation][]=[
 [/potter at the wheel|thrower/i,worker('Give me a moment. What is it?','Is that hard to shape?','The neck is. Push too fast and it folds.','How do you know when to stop?',"You feel it give under your fingers. It took me a while to learn.")],
 [/vessel painter|painter/i,worker('Did you want a closer look?','What are you painting?','The decoration. The lines still need to read when the pot is turned.','Do people notice that?',"They notice when it's wrong.")],
 [/drying.room/i,worker('Careful with those. They are still soft.','How long before they can be moved?','They need time to dry. Moving them too soon is asking for trouble.','Can you hurry it along?',"Not without losing some. I would rather wait.")],
 [/kiln tender/i,worker('Stay back a little. Did you need something?','How do you know how the firing is going?','I watch the colour and the fire. You get used to the changes.','Was that hard to learn?',"Yes. A bad firing is an expensive lesson.")],
 [/willow mender|basket.repair|basket maker/i,worker('Have you brought a basket to mend?','No. How do you make the willow bend?','We soak it first. Dry willow splits when you force it.','And if a basket breaks?',"Bring it before the whole thing comes apart. A few uprights are easier to replace.")],
 [/sandal|leather/i,worker('Is it the strap, or the sole?','Neither. I was watching you work.','Then you have better sandals than some people who come here.','Can most pairs be repaired?',"A strap, usually. A sole worn right through is another matter.")],
 [/oil seller|olive oil/i,worker('Were you looking for oil?','How do you get it from the olives?','We crush them, then press them. The oil needs to settle before it goes into jars.','Can you use all the fruit?',"Some is damaged. We pick that out rather than press it with the rest.")],
 [/wool sorter|cloth yard helper|wool/i,worker('Did you need this bench?','No. What are you doing with the wool?','Sorting it after washing. The hanks on the rack are drying.','Does it take long?',"Long enough. It is better to do it properly before it gets worked into cloth.")],
 [/linen|weav|cloth/i,worker('Looking for cloth?','I was wondering what you make here.','We mend and fold it here. The finished pieces go back down the lane.','Do you make it all yourselves?',"There are several hands in a piece of cloth. You are only seeing part of the work.")],
 [/fish|net/i,worker('Were you after fish?','No. What are you doing with those nets?','Drying them. Then we look for places that need mending.','Before they go out again?',"Better now than after losing a catch.")],
 [/crane|receiv|harbour|dock|merchant store/i,worker('Did you want something unloaded?','No. I was watching the work.','Then watch the crane when it starts moving. Give the load room.','What is coming in?',"Jars and other cargo. It depends which ship is alongside.")],
 [/ship|refit/i,worker('Were you looking for the shipwright?','What is being done to the hull?','Repairs. It needs checking before it goes back in the water.','Can I have a look?',"From the aisle, yes. Watch where you put your feet.")],
 [/academy teacher|lyceum teacher/i,worker('Were you joining us?','What are you discussing?','How to tell a sound argument from one that only sounds convincing.','How do you do that?',"Ask what each claim rests on. People become less certain when they have to explain it.")],
 [/student|scholar|observer|listener/i,worker('Did you catch what was said?','No. Have you been here long?','A while. I want to get the argument straight before I copy it down.','Why not write it down as you listen?',"I do. Then I have to work out which parts I misunderstood.")],
 [/guard|hoplite/i,worker('Where are you headed?','Just having a look around.','All right. Keep an eye on the traffic.','Is it always this busy?',"Some days more than others. You learn to leave room for a cart.")],
 [/bread|baker/i,worker('Were you after bread?','Have you been working since morning?','Since before most people were up.','Does it all go today?',"We hope so. People want it fresh.")],
 [/household|neighbour|resident/i,worker('Were you looking for someone?','Do you live here?','With my family, yes.','Is the market far from here?',"You will find your way back through the lanes. Just mind the people coming through.")],
 [/fig|fruit/i,worker('Would you like a look?','Are these for eating now?','They are. Take your time choosing.','Do they keep?',"Not forever. Fresh fruit is best bought when you mean to eat it.")],
];
const CITIZEN:Conversation={
 start:turn('Are you new here?',say('Is it that obvious?','new'),say('Where do people gather?','gather'),bye('Just passing through.')),
 new:turn("You are looking up. Most of us are watching where we put our feet.",say('There is a lot to take in.','gather'),bye('Fair enough.')),
 gather:turn('The Agora, if there is business. The Pnyx, when the Assembly meets. Were you looking for someone?',bye("No. I'll find my way, thanks.")),
};
const UNKNOWN:Conversation={start:turn('Yes? Did you want something?',say('No, just saying hello.','hello'),bye('Sorry. I will let you get on.')),hello:turn('Hello, then. Take care.',bye('You too.'))};

export function nodeFor(npc:any,nodeId='start'){
 if(!npc?.rootMesh)return null;
 // The chariot stops keep their own authored dialogue and scene owners.
 if(/road-(grain-yard|eleusis|spring|vineyard|estate|rope-tender|landing-crew|cradle-crew)/.test(npc.rootMesh.name??''))return null;
 const name=String(npc.name??''),role=String(npc.rootMesh.metadata?.role??'');
 const philosopher=PHILOSOPHERS[npc.id];
 const tree=philosopher??PROFILES.find(([pattern])=>pattern.test(name+' '+role))?.[1]??(/citizen/i.test(name+' '+role)?CITIZEN:UNKNOWN);
 const node=tree[nodeId]??tree.start;
 return{speaker:name,title:'',text:node.text,options:node.options};
}

/** Presentation paraphrases only. The underlying scenario facts, definition
 * hash, consent, prices and transaction commands are deliberately unchanged. */
export const neighbourReply=(option:string)=>({
 'ask-instruction':"Keep the plain-rim cups apart. Don't tie them up until Myrine has picked the handles.",
 'ask-reply':"The broad-handled pair is ready. I can wrap it once Hegeso knows what Myrine wants.",
 'ask-preference':"Two plain-rim cups with broad handles, please. Wrapped together in cloth.",
 'ask-consent':"Yes, please. Ask her to keep that pair for me at four obols. I'll come for them later.",
} as Record<string,string>)[option];
