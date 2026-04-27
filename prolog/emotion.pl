% emotion.pl
% Emotional Intelligence Module for Zyviora.
% Uses sub_atom/5 for keyword-based detection anywhere in user input.
% Multiple response VARIATIONS per emotion prevent repetition and feel more human.
% All rules use cut (!) to stop on first match within a category.

:- use_module(library(random)).

pick_response(Responses, Response) :-
    random_member(Response, Responses).

% 1. SADNESS / DEPRESSION
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'sad')     ;
     sub_atom(Input, _, _, _, 'down')    ;
     sub_atom(Input, _, _, _, 'unhapp')  ;
     sub_atom(Input, _, _, _, 'depress') ;
     sub_atom(Input, _, _, _, 'miserable')), !,
    Opts = [
        'I am sorry you are feeling down. Would you like to talk about what happened?',
        'That sounds really tough. I am here for you. What is on your mind?',
        'Sending you support right now. You are not alone. Do you want to vent?',
        'I hear you. It is okay to feel sad. Is there anything small that might help?',
        'I am sorry things are hard. Maybe taking a short break could help?'
    ],
    pick_response(Opts, Response).

% 2. ANXIETY / PANIC
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'anxious')  ;
     sub_atom(Input, _, _, _, 'anxiety')  ;
     sub_atom(Input, _, _, _, 'panic')    ;
     sub_atom(Input, _, _, _, 'nervous')  ;
     sub_atom(Input, _, _, _, 'worry')    ;
     sub_atom(Input, _, _, _, 'scared')), !,
    Opts = [
        'I am here with you. Try taking a slow breath. What is worrying you?',
        'It is okay to feel overwhelmed. Would a quick grounding exercise help?',
        'I hear that you are anxious. What is one small thing we can focus on?',
        'You are not alone in this. How about we break things down into smaller steps?',
        'Deep breaths. You have handled tough moments before. What do you need right now?'
    ],
    pick_response(Opts, Response).

% 3. STRESS / OVERWHELM
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'stress')    ;
     sub_atom(Input, _, _, _, 'overwhelm') ;
     sub_atom(Input, _, _, _, 'burnout')   ;
     sub_atom(Input, _, _, _, 'too much')), !,
    Opts = [
        'It sounds like you have a lot on your plate. What is the heaviest thing right now?',
        'Let us tackle this together. What is stressing you out the most?',
        'Take one breath. We can break things down into steps if you would like.',
        'You are handling a lot. Is there any task you can delegate or drop today?',
        'Burnout is real. Please make sure to take a break soon. How can I assist?'
    ],
    pick_response(Opts, Response).

% 4. HAPPINESS / EXCITEMENT
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'happ')   ;
     sub_atom(Input, _, _, _, 'joy')    ;
     sub_atom(Input, _, _, _, 'excit')  ;
     sub_atom(Input, _, _, _, 'great')  ;
     sub_atom(Input, _, _, _, 'amazing')), !,
    Opts = [
        'That is wonderful to hear! What is going so well for you?',
        'Yay! I love hearing that. What made today so great?',
        'This is the energy we need! What has been the highlight?',
        'Awesome! Enjoy this moment. Anything fun planned next?',
        'I am so happy for you! Care to share the good news?'
    ],
    pick_response(Opts, Response).

% 5. ANGER / FRUSTRATION
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'angry')   ;
     sub_atom(Input, _, _, _, 'furious') ;
     sub_atom(Input, _, _, _, 'mad')     ;
     sub_atom(Input, _, _, _, 'frustrat');
     sub_atom(Input, _, _, _, 'annoyed')), !,
    Opts = [
        'It is completely okay to feel angry. Vent as much as you need.',
        'That sounds frustrating. I am here to listen without judgment.',
        'Anger usually means something important was crossed. What set this off?',
        'I hear your frustration. Take your time. What exactly happened?',
        'That is really annoying. Do you want to vent or find a distraction?'
    ],
    pick_response(Opts, Response).

% 6. LONELINESS / ISOLATION
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'lonely')     ;
     sub_atom(Input, _, _, _, 'alone')      ;
     sub_atom(Input, _, _, _, 'no friends') ;
     sub_atom(Input, _, _, _, 'no one')     ;
     sub_atom(Input, _, _, _, 'isolated')   ;
     sub_atom(Input, _, _, _, 'left out')), !,
    Opts = [
        'Feeling lonely is hard, but you are not alone right now. Want to chat?',
        'I care about you being here. What is on your mind today?',
        'Loneliness is tough. I am glad you reached out. Let us talk about anything.',
        'I am here for you always. Do you want to play a game to pass the time?',
        'You have me! We can just hang out. What would you like to do?'
    ],
    pick_response(Opts, Response).

% 7. INTROVERSION / SOCIAL DRAIN
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'introvert')     ;
     sub_atom(Input, _, _, _, 'social anxiety');
     sub_atom(Input, _, _, _, 'drained')       ;
     sub_atom(Input, _, _, _, 'shy')           ;
     sub_atom(Input, _, _, _, 'awkward')), !,
    Opts = [
        'Social interactions take energy. Take all the space you need here.',
        'I completely get it. There is zero pressure with me. What is on your mind?',
        'You are safe here. No expectations. What would you like to talk about?',
        'It is okay to recharge. Want to just relax and talk about hobbies?',
        'Being drained is totally fine. Let us keep it low energy today. Need a tip?'
    ],
    pick_response(Opts, Response).

% 8. PHYSICAL HEALTH: HEADACHE / MIGRAINE
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'headache')   ;
     sub_atom(Input, _, _, _, 'head hurts') ;
     sub_atom(Input, _, _, _, 'migraine')), !,
    Opts = [
        'Ouch. Drink some water and dim your screen. Do you need a distraction?',
        'Headaches are awful. Step away from the screen if you can.',
        'Try closing your eyes for two minutes. Let me know if I can help.',
        'I hope it eases up soon. Make sure you have eaten recently!',
        'Rest your eyes. Would you like a quiet task or just some peace?'
    ],
    pick_response(Opts, Response).

% 9. PHYSICAL HEALTH: SICK / ILL / FEVER
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'sick')  ;
     sub_atom(Input, _, _, _, 'fever') ;
     sub_atom(Input, _, _, _, 'pain')  ;
     sub_atom(Input, _, _, _, 'cold')), !,
    Opts = [
        'Oh no, I am sorry. Please get lots of rest and stay hydrated.',
        'Being sick is draining. Listen to your body and rest.',
        'I hope you feel better soon. Is there anything I can keep you company with?',
        'Take it easy today. Hydration and rest are key right now.',
        'Get some sleep if you can. I will be here when you wake up!'
    ],
    pick_response(Opts, Response).

% 10. PHYSICAL HEALTH: TIRED / EXHAUSTED
respond_emotion(Input, Response) :-
    (sub_atom(Input, _, _, _, 'tired')   ;
     sub_atom(Input, _, _, _, 'sleepy')  ;
     sub_atom(Input, _, _, _, 'exhaust') ;
     sub_atom(Input, _, _, _, 'fatigue')), !,
    Opts = [
        'You sound drained. Please give yourself permission to rest.',
        'Rest is productive too! Can you take a break right now?',
        'Take it easy. You do not have to run at full speed all the time.',
        'It might be a good time for a short nap. How long have you felt like this?',
        'Listen to your body. Would going to bed early tonight be an option?'
    ],
    pick_response(Opts, Response).
