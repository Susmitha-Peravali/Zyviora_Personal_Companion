% conversation.pl
% Module for greetings, chitchat, and general conversation.

:- use_module(library(random)).

pick_conv_response(Responses, Response) :-
    random_member(Response, Responses).

% Strict matching for short greetings
greet(Input, Response) :-
    (Input == 'hi' ; Input == 'hello' ; Input == 'hey'), !,
    Opts = [
        'Hi there! How can I help you today?',
        'Hello! What are we working on today?',
        'Hey! How has your day been so far?',
        'Hi! Let me know if you need any help.',
        'Hello! What is on your mind?'
    ],
    pick_conv_response(Opts, Response).

% Substring matching for longer conversational statements
greet(Input, Response) :-
    sub_atom(Input, _, _, _, 'how are you'), !,
    Opts = [
        'I am doing well, thanks for asking! How are you?',
        'I am great! Ready to help you. What do you need?',
        'Doing wonderful! How has your day been?',
        'All good here! How are things with you?',
        'I am doing well today! What can I assist you with?'
    ],
    pick_conv_response(Opts, Response).

% Handling user saying they are "good" or "fine"
greet(Input, Response) :-
    (sub_atom(Input, _, _, _, 'good') ; sub_atom(Input, _, _, _, 'great') ; sub_atom(Input, _, _, _, 'fine') ; sub_atom(Input, _, _, _, 'okay')), !,
    Opts = [
        'Glad to hear that! What are you up to?',
        'That is great! Let me know if you need anything.',
        'Awesome! Anything I can help you with today?',
        'Good to hear! What is on your agenda?',
        'Nice! How can I assist you right now?'
    ],
    pick_conv_response(Opts, Response).

% Handling user saying "thank you"
greet(Input, Response) :-
    (sub_atom(Input, _, _, _, 'thank') ; sub_atom(Input, _, _, _, 'thx')), !,
    Opts = [
        'You are very welcome! Let me know if you need more help.',
        'Anytime! What else can we do?',
        'Glad I could help! Have a great day.',
        'You are welcome! Let me know if something else comes up.',
        'No problem! I am always here to help.'
    ],
    pick_conv_response(Opts, Response).
