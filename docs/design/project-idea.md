# Building win-hackathon Plugin

I would like to create a Claude Code plugin call win-hackathon. As a full stack software engineer and ai engineer, I have been participating in many hackathons generally from https://devpost.com/hackathons where I generally build projects end to end using the technologies or tools provided in the hackathons. I was able to win two hackathons where for one it was the best design and the other was the second place: https://devpost.com/software/kintwadi-one-shared-record-for-family-caregiving and  https://devpost.com/software/karma-the-reincarnation-agent-for-deprecated-services .  

Githubs: https://github.com/rogerjeasy/karma and https://github.com/rogerjeasy/kintwadi

Here is my entire process end to end:
1. I start by reading the hackathon overview, rules and resources.
2. Next, I do the brainstorming of the most creative, innovative project ideas. Usually 10 potential winning ideas. Each project contain problem statement, intented audience, key features. To accomplish this, I use Claude Code with the superpowers brainstorm Subagent drive development.
3. Next, from the 10 project ideas, I select one that I like the most. In case I don't like any of the 10, I ask the start a new session by clearing (/clear) and then ask the agent to regenerate or generate 10 fresh new project ideas independantely from the previous ones.
    a. The regenerate/generate process is repeated until I find one project I like the most and think will be winning the hackathon.
4. Next, I ask Claude Opus to write the full and complete project description as a markdown file:
    a. Description, Goal, Targeted users, Features, limitations, 
5. Next, I define the technology tools or framework if they were not specified in the hackathon documentation:
    5.1. For frontend, I like to use NextJS latest with Typescript, and Twailind CSS, ShadeCN UI for the best styling.
    5.2. For backend: fastapi with python poetry for dependency management.
6. Next, I ask Claude Code to generate the specification plan using superpower in a new session
7. Next, I ask Claude Code to write the plan in a new session
8. Next, I ask claude to implement the plan using superpower SDD


### PHASES OR STEPS TO BUILD THE PROJECT
So for the plugin I want to build, it should the phases
1. Brainstorm project idea :
    1.1 The user can project the devpost url of the hackathon they want to participate 
2. Project description
3. Architecture documentation
4. Requirements
5. OpenSpec
6. Build or implementation phase (using superpower SDD)
7. Review agent of the code quality,architecture quality

### RULES
1. At the end of each phase, agent should always ask for approval before going to the next step.
2. an agent performing a task and faces an issue should always write it down in a shared created markdown file. This will help when filling the devpost form in the Challengens meet section.

For commands:
1. A command to initialize the folder with our plugin by installing or downloading all the necessary skills/agents/tools that we need
        Command name: win-hackathon/init
    If we for example already have an existing project with some Claude Code configuration and that the user run the command win-hackathon/init, it should ALWAYS ask the user permission before overwiting anything.
A command win-hackathon/build

The plugin should load the necessary SKILLs or tools to perform a given task at a given phase. For example, I will define a skill file with the instruction prompt on how to do the brainstorming of project idea. I will define a skill about the principles to design the UI. another one for structuring the frontend and backend folder structure in a mono-repo folder. another on how to architecture of the frontend. another on the architecture of the backend and so on.

Because everything time when participating in a hackathon, I basically prompt almost the same thing.
this will also allow me to have the same agentic engineering setup when I change a device.

The plugin should have hooks, commands, agents, skills, opensec, gerkin rules and so on.