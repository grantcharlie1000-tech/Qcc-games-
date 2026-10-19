export interface StudyTopic {
  id: string;
  subject: string;
  title: string;
  subtitle: string;
  objective: string;
  sections: {heading: string; paragraphs: string[]}[];
  diagram: {svg: string; caption: string};
  example: {title: string; question: string; steps: string[]; result: string};
  check: {question: string; answer: string};
}

// Raw imports are eager: reading or changing chapters never fetches a file.
const diagrams = import.meta.glob<string>('./diagrams/*.svg', {query:'?raw', import:'default', eager:true});
const diagram = (id:string, caption:string)=>({svg:diagrams[`./diagrams/${id}.svg`], caption});

export const studyTopics: readonly StudyTopic[] = [
  {
    id:'close-reading',subject:'English',title:'Reading between the lines',subtitle:'Close reading & language',
    objective:'Connect a precise language choice to an interpretation of a text.',
    sections:[
      {heading:'Start with what the text actually says',paragraphs:[
        'Close reading moves from a small detail to a defensible idea about the whole text. Read once for the situation: who is speaking, what is happening, and to whom? Read again for patterns in imagery, word choice, sentence structure and tone. An interpretation needs evidence, rather than a guess about what an author must have intended.',
        'Distinguish a technique from its effect. Naming a metaphor is a useful observation, but it does not explain why that metaphor matters here. Ask which associations the words invite and how those associations connect to a character, conflict or central idea.'
      ]},
      {heading:'Follow detail → effect → meaning',paragraphs:[
        'Choose a short quotation that contains the feature you want to discuss. Explain how its particular words might position the reader. Then connect that response to an idea in the text. Effects are contextual: a short sentence can create urgency, finality or calm depending on the surrounding passage. Avoid a fixed dictionary of technique-and-effect pairs.'
      ]},
      {heading:'Make room for a second reading',paragraphs:[
        'A convincing analysis tests its claim against another detail. If the first image suggests freedom but later images suggest confinement, explain the tension instead of ignoring it. Use qualified language such as “suggests” when more than one interpretation is plausible. In revision, underline the evidence in each paragraph and check that your explanation accounts for its exact wording.'
      ]}
    ],
    diagram:diagram('close-reading','A useful reasoning chain: evidence, language choice, reader response, interpretation.'),
    example:{title:'Worked reading · an original sentence',question:'“The gate swallowed her, and the street fell silent.” How could the gate help develop an idea about belonging?',steps:[
      '“Swallowed” gives the gate the action of a living creature: personification.',
      'The verb makes entry seem threatening rather than welcoming; the following silence strengthens her isolation.'
    ],result:'The entrance suggests that belonging to this place may involve losing safety or a voice. A wider-text claim would need further supporting details.'},
    check:{question:'Why is “The writer uses personification to interest the reader” incomplete?',answer:'It names a technique and a vague effect, but does not explain the associations of the actual words or connect them to an interpretation.'}
  },
  {
    id:'essay-writing',subject:'English',title:'Building a convincing argument',subtitle:'Essay structure & evidence',
    objective:'Develop a thesis and paragraphs whose evidence supports that thesis.',
    sections:[
      {heading:'Answer the question with a thesis',paragraphs:[
        'An essay is a connected argument, not a list of everything you remember. Identify the instruction in the question and the idea it asks you to investigate. A thesis gives your answer and a reason for that answer. “The character changes” describes a topic; “The character’s changing response to failure reveals that courage is learned through responsibility” makes an arguable claim.',
        'Before writing, choose two or three reasons that together support the claim. Put them in an order that develops your thinking. Each paragraph should add something, rather than repeat the thesis with a different quotation.'
      ]},
      {heading:'Make evidence do a job',paragraphs:[
        'A paragraph can move through claim, evidence, explanation and a link to the argument. These are reasoning tasks, not a compulsory sentence formula. Introduce enough context to make a quotation intelligible, keep the quotation precise, and spend most of the paragraph explaining how the detail supports your interpretation. Discuss a technique when it helps explain the meaning.'
      ]},
      {heading:'Revise the line of reasoning',paragraphs:[
        'Read only the first sentence of each paragraph. Can you follow a developing answer to the question? Then check the evidence and explanation within each paragraph. A conclusion should bring the reasoning together and show its significance. It should not introduce a major new example that the essay has not analysed. Leave time to correct references, punctuation and unclear pronouns.'
      ]}
    ],
    diagram:diagram('essay-writing','A paragraph is a small argument that helps support the essay’s larger claim.'),
    example:{title:'From observation to argument',question:'An invented story shows a runner initially hiding an injury, then asking their team for help. What could a paragraph argue?',steps:[
      'Make a claim: the runner’s decision redefines strength as accepting support.',
      'Select the moment of asking for help and explain how its language contrasts with earlier secrecy.'
    ],result:'The paragraph can link the contrast to a thesis about responsibility and community, rather than merely retelling the two scenes.'},
    check:{question:'What should you do if a favourite quotation does not support your thesis?',answer:'Choose more relevant evidence, or revise the thesis if the wider text challenges it. Do not force the quotation to prove something it does not show.'}
  },
  {
    id:'poetry',subject:'English',title:'Making sense of a poem',subtitle:'Speaker, imagery & tone',
    objective:'Explain how a poem’s voice, images and structure create meaning.',
    sections:[
      {heading:'Hear the voice before naming devices',paragraphs:[
        'Read a poem aloud or imagine its pace. Identify the speaker, the apparent audience and the immediate situation. The speaker is a constructed voice and need not be the poet. A poem can present an uncertain, ironic or unreliable voice, so distinguish what the speaker claims from what the poem as a whole may suggest.',
        'Paraphrase the literal situation before interpreting it. If a word is unfamiliar, use the surrounding lines to form a tentative meaning and revisit that choice later. Confusion is a reason to read more closely, not to invent a hidden message.'
      ]},
      {heading:'Track images and tonal movement',paragraphs:[
        'Group related images: light and dark, enclosure and openness, movement and stillness. Ask how an image develops across the poem. Tone is the attitude conveyed by the voice; support a tonal description with particular words, sounds or rhythms. A shift may be signalled by a word such as “but”, a stanza break, a change of tense or an unexpected image.'
      ]},
      {heading:'Read the shape as well as the sentence',paragraphs:[
        'Enjambment carries a sentence across a line break; an end-stopped line gives a grammatical pause. Neither has one automatic effect. A break may briefly emphasise a word or delay information. Compare that local effect with the poem’s larger movement. A strong response explains how voice, image and structure work together, and acknowledges uncertainty where the text leaves it open.'
      ]}
    ],
    diagram:diagram('poetry','A tonal shift is an interpretation to test against words and structure, not a feature to assume.'),
    example:{title:'An original two-line image',question:'“I left the window open for the sea, / but morning found my hands upon the latch.” What changes?',steps:[
      'The open window and sea invite an interpretation of possibility or freedom.',
      '“But” turns toward a restrictive image: hands at the latch suggest hesitation or a wish for control.'
    ],result:'The voice appears divided between openness and protection. A full interpretation would consider the surrounding poem, not treat this image as conclusive on its own.'},
    check:{question:'Can you assume that a poem written in the first person describes the poet’s own life?',answer:'No. First-person speakers can be invented. Use evidence from the text and relevant verified context, rather than equating the voice with the author.'}
  },
  {
    id:'film-language',subject:'English',title:'Reading a film frame',subtitle:'Camera, sound & editing',
    objective:'Explain how film techniques combine to position an audience.',
    sections:[
      {heading:'Describe before you interpret',paragraphs:[
        'Begin with a specific moment: what is visible, what is audible and what happens before or after it? Framing determines what enters the image and what remains outside. A close-up can direct attention to an expression; a wide shot can establish relationships between a person and their environment. Neither determines a meaning without the scene’s context.',
        'Mise-en-scène includes the setting, costume, lighting, props and performance arranged in front of the camera. These choices can suggest social relationships or a character’s state of mind, but your explanation should show the evidence for that reading.'
      ]},
      {heading:'Connect angle, sound and sequence',paragraphs:[
        'A low-angle shot may make a figure imposing, while another scene might use it to show a child’s perspective. Diegetic sound belongs to the story world, such as a door closing. Non-diegetic sound, such as a score heard by the audience, can guide expectations. Editing shapes how separate shots relate in time, space and meaning.'
      ]},
      {heading:'Explain the combination',paragraphs:[
        'Avoid a catalogue of techniques with no argument. Select two choices that work together and explain their contribution to an idea. For example, a long shot can isolate a figure while the removal of background sound focuses attention on their breathing. Compare another moment to show how this effect develops or changes. Distinguish a character’s viewpoint from the film’s larger perspective.'
      ]}
    ],
    diagram:diagram('film-language','The frame is a simplified original example; a low angle gains meaning from its surrounding scene.'),
    example:{title:'Two choices working together',question:'An invented scene cuts from a crowded hall to a close-up of a student, with the crowd’s sound fading. What might this achieve?',steps:[
      'The close-up directs attention to the student’s reaction rather than the wider event.',
      'Fading crowd sound can create a sense of subjective isolation or intense concentration.'
    ],result:'Together the choices may position us close to the student’s experience. The expression and surrounding story help decide which interpretation is stronger.'},
    check:{question:'Why is “low angle means powerful” an unsafe rule?',answer:'It ignores context. A low angle may suggest power, vulnerability in a viewpoint, scale, or another effect depending on performance, framing and the scene.'}
  },
  {
    id:'linear-relationships',subject:'Maths',title:'The story of a straight line',subtitle:'Linear relationships',
    objective:'Interpret gradient and intercept, and use a linear model in context.',
    sections:[
      {heading:'A constant rate of change',paragraphs:[
        'A linear relationship has a constant rate of change. In y = mx + c, m is the gradient and c is the y-intercept. Gradient is change in y divided by change in x. A positive gradient means y increases as x increases; a negative gradient means it decreases. A horizontal line has gradient zero. A vertical line has no defined gradient.',
        'The intercept is the value of y when x is zero. In a context it may represent a starting amount or fixed charge. State units: a gradient measured in dollars per hour describes a different quantity from a gradient measured in metres per second.'
      ]},
      {heading:'Move between table, rule and graph',paragraphs:[
        'Choose two points with different x-values, calculate the gradient, and substitute one point into y = mx + c to find c. Check a third point if one is available. On a graph, use the axis scales rather than counting unlabelled squares. To find where two linear models agree, set their expressions equal and solve the resulting equation.'
      ]},
      {heading:'Keep the model’s limits in view',paragraphs:[
        'A line can extend forever on paper while its context cannot. A hire charge may apply only for whole hours or a limited time. Interpolation estimates within the observed range; extrapolation extends beyond it and needs more caution. Give a numerical answer with a sentence explaining what it means, and check whether the value is possible in the original situation.'
      ]}
    ],
    diagram:diagram('linear-relationships','For y = 2x + 3, the intercept is 3 and each increase of 1 in x adds 2 to y.'),
    example:{title:'A fixed charge and an hourly rate',question:'A fictional bike hire costs $8 for one hour and $14 for three hours. Assume a linear charge. What is its rule?',steps:[
      'Gradient = (14 − 8) ÷ (3 − 1) = 3 dollars per hour.',
      'Substitute (1, 8): 8 = 3 × 1 + c, so c = 5.'
    ],result:'C = 3h + 5. The model has a $5 fixed charge and adds $3 per hour; at four hours it predicts $17.'},
    check:{question:'What is the gradient through (2, 9) and (5, 3)?',answer:'(3 − 9) ÷ (5 − 2) = −2. For every increase of one unit in x, y decreases by two units.'}
  },
  {
    id:'quadratics',subject:'Maths',title:'Finding the shape of a quadratic',subtitle:'Roots, factors & turning points',
    objective:'Connect the factorised form of a quadratic to its graph and solutions.',
    sections:[
      {heading:'A curve with a changing gradient',paragraphs:[
        'A quadratic expression has an x-squared term and no higher power of x. Its graph is a parabola. In y = ax² + bx + c, a positive a opens the curve upward and a negative a opens it downward. The turning point is a minimum or maximum. Unlike a straight line, a quadratic’s gradient changes as x changes.',
        'The y-intercept is c because x = 0 makes the x-terms zero. Roots are x-values where y = 0. A graph may have two, one repeated, or no real roots. Finding roots and finding a turning point are different tasks.'
      ]},
      {heading:'Use factors to find zeros',paragraphs:[
        'If y = (x − r)(x − s), a zero occurs when either factor is zero. Thus the roots are r and s. The axis of symmetry lies halfway between two roots: x = (r + s)/2. Substitute this x-value into the original expression to find the turning point’s y-value. Expanding the factors provides a useful algebraic check.'
      ]},
      {heading:'Choose the solution that fits the situation',paragraphs:[
        'A contextual equation may produce two mathematical solutions but only one realistic answer. A negative time or a length outside the model’s range may need to be rejected with a reason. Sketch a labelled graph to connect roots, intercept and turning point. Do not discard a negative answer merely because it is negative: its meaning depends on the quantity being modelled.'
      ]}
    ],
    diagram:diagram('quadratics','The roots 1 and 3 are equally distant from the symmetry line x = 2.'),
    example:{title:'Factors reveal the graph',question:'Find the roots and vertex of y = x² − 4x + 3.',steps:[
      'Factorise: x² − 4x + 3 = (x − 1)(x − 3), so the roots are 1 and 3.',
      'The symmetry line is x = (1 + 3)/2 = 2. Substitution gives y = 4 − 8 + 3 = −1.'
    ],result:'The vertex is (2, −1). The parabola opens upward and crosses the y-axis at 3.'},
    check:{question:'For y = (x + 2)(x − 4), what are the roots and symmetry line?',answer:'The roots are −2 and 4, and their midpoint is 1, so the axis of symmetry is x = 1.'}
  },
  {
    id:'trigonometry',subject:'Maths',title:'Measuring what you cannot reach',subtitle:'Right-angled trigonometry',
    objective:'Choose sine, cosine or tangent and interpret a measurement with units.',
    sections:[
      {heading:'Label relative to the chosen angle',paragraphs:[
        'In a right-angled triangle, the hypotenuse is opposite the right angle and is the longest side. The opposite side lies across from the angle you are using; the adjacent side touches that angle and is not the hypotenuse. Opposite and adjacent swap when you choose the other acute angle. Label the diagram before writing an equation.',
        'The ratios are sin θ = opposite/hypotenuse, cos θ = adjacent/hypotenuse, and tan θ = opposite/adjacent. Choose the one containing the known side and the side you want. These forms apply to right-angled triangles; do not apply them unchanged to a triangle without a right angle.'
      ]},
      {heading:'Set up the equation before calculating',paragraphs:[
        'Write the ratio, substitute values, then rearrange. To find an angle, use an inverse function such as tan⁻¹(opposite/adjacent). This notation means inverse tangent, not one divided by tangent. Check that your calculator is in degree mode when working with degrees. Keep extra digits during the calculation and round at the end.'
      ]},
      {heading:'Turn a measurement into a model',paragraphs:[
        'A height problem may need a horizontal ground distance and an angle of elevation. A sloping distance is a different side. If an angle is measured from eye height, add that height to the calculated vertical distance. State assumptions such as level ground, and check whether the answer has a reasonable scale. A labelled sketch often reveals the main source of error before any arithmetic.'
      ]}
    ],
    diagram:diagram('trigonometry','Side names depend on θ; the 3–4–5 triangle also satisfies Pythagoras’ theorem.'),
    example:{title:'Height from an angle',question:'From 12 m away on level ground, the angle from ground level to the top of a post is 35°. Find its height.',steps:[
      'Opposite is height h and adjacent is 12 m, so tan 35° = h/12.',
      'Multiply by 12: h = 12 tan 35° ≈ 8.402 m.'
    ],result:'The post is approximately 8.4 m tall. An eye-level measurement would require adding the observer’s eye height instead.'},
    check:{question:'A right triangle has opposite side 3 and hypotenuse 5. Which ratio finds θ?',answer:'Use sin θ = 3/5, so θ = sin⁻¹(0.6) ≈ 36.9° in degree mode.'}
  },
  {
    id:'probability',subject:'Maths',title:'Following the branches of chance',subtitle:'Probability & conditional events',
    objective:'Use a probability tree and recognise when one event changes another.',
    sections:[
      {heading:'Define the possible outcomes',paragraphs:[
        'A probability is a number between zero and one describing how likely an event is within a model. For equally likely outcomes, divide the number of favourable outcomes by the total. Check that the outcomes really are equally likely: two categories such as “rain” and “no rain” need not each have probability one half.',
        'An event’s complement is everything outside it, so P(not A) = 1 − P(A). Mutually exclusive events cannot occur together. Independent events are different: knowing one happened does not change the probability of the other.'
      ]},
      {heading:'Multiply along a branch; add across alternatives',paragraphs:[
        'A tree separates a sequence into stages. Probabilities leaving the same branch point sum to one. Multiply along a complete route, using the probability at the second stage conditional on the first. Add route probabilities for mutually exclusive ways to get the required event. When objects are drawn without replacement, the number remaining changes, so the events are generally dependent.'
      ]},
      {heading:'Interpret a conditional probability',paragraphs:[
        'P(B given A) restricts attention to cases where A has occurred. Its denominator is that restricted group, not the original whole population. A table can make this easier to see. Always state the event and the condition in words. A numerical probability is a model result, not a promise about the next single trial; relative frequencies may vary, especially in small samples.'
      ]}
    ],
    diagram:diagram('probability','After the first draw the bag contains four counters; the second-stage probabilities must change.'),
    example:{title:'Two counters without replacement',question:'A bag holds 3 red and 2 blue counters. What is the probability of drawing two red counters?',steps:[
      'First red: 3/5. Given that red was removed, second red: 2/4.',
      'Multiply along this route: (3/5) × (2/4) = 6/20.'
    ],result:'P(two red) = 3/10 = 0.3. Using 3/5 for both draws would incorrectly assume replacement or independence.'},
    check:{question:'What is the probability of one red and one blue, in either order?',answer:'Red then blue is (3/5)(2/4) = 6/20. Blue then red is (2/5)(3/4) = 6/20. Add them: 12/20 = 3/5.'}
  },
  {
    id:'forces',subject:'Science',title:'Why motion changes',subtitle:'Forces & acceleration',
    objective:'Find a resultant force and connect it to acceleration using F = ma.',
    sections:[
      {heading:'Separate motion from change in motion',paragraphs:[
        'Velocity describes speed and direction; acceleration describes a change in velocity per unit time. An object can be moving while the resultant force on it is zero. In a simple model with constant mass, zero resultant force means constant velocity, which includes remaining at rest. It does not necessarily mean that no forces act.',
        'Draw a force diagram for one object. Include interactions such as weight, a normal contact force, friction and a push or tension. Forces have directions, so add them as vectors. Equal opposite forces on the same object cancel in the resultant; action–reaction pairs act on different objects and do not cancel in a single-object diagram.'
      ]},
      {heading:'Use the resultant, not a single push',paragraphs:[
        'Newton’s second law is Fnet = ma for this model. Use newtons, kilograms and metres per second squared. Choose a positive direction and keep signs consistent. If a trolley is pushed right while friction acts left, subtract friction from the push before finding acceleration. A negative result means acceleration opposite your chosen positive direction.'
      ]},
      {heading:'Check the explanation in context',paragraphs:[
        'Mass measures inertia and is measured in kilograms; weight is gravitational force and is measured in newtons. Near Earth, weight is approximately mg with g ≈ 9.8 m/s². On level ground with no vertical acceleration, normal force can balance weight while a horizontal resultant still causes acceleration. State any simplifying assumptions, such as negligible air resistance or a constant friction force.'
      ]}
    ],
    diagram:diagram('forces','Vertical forces balance, but the unequal horizontal forces produce a resultant to the right.'),
    example:{title:'A trolley with friction',question:'A 4 kg trolley has a 12 N push right and a 4 N friction force left. Find its acceleration.',steps:[
      'Choose right as positive: Fnet = 12 − 4 = 8 N right.',
      'a = Fnet/m = 8/4 = 2 m/s².'
    ],result:'The acceleration is 2 m/s² to the right. This describes how velocity changes, not the trolley’s current speed.'},
    check:{question:'A car travels straight at constant velocity. Must its engine force be zero?',answer:'No. A driving force can balance resistive forces. The resultant is zero even though individual forces are acting.'}
  },
  {
    id:'energy',subject:'Science',title:'Keeping an energy account',subtitle:'Energy transfers & efficiency',
    objective:'Account for energy transfers and calculate useful efficiency.',
    sections:[
      {heading:'Energy is conserved, usefulness is not',paragraphs:[
        'Energy can be transferred between stores and between parts of a system. In an energy account, the total does not disappear. Some transfers are useful for the purpose of a device, while others spread energy into the surroundings, often by heating. Calling energy “wasted” means it is less useful for that purpose, not that it has been destroyed.',
        'Define the system and the time interval before comparing inputs and outputs. A moving ball has kinetic energy; a raised object in an approximately uniform gravitational field has gravitational potential energy relative to a chosen reference height. A battery stores energy chemically, rather than storing a supply of electric current.'
      ]},
      {heading:'Use formulas with a clear physical meaning',paragraphs:[
        'Kinetic energy is Ek = ½mv². A change in gravitational potential energy near Earth is ΔEp = mgΔh. Mechanical work by a constant force along a displacement is W = Fd; if the force is at an angle, only its component along the displacement contributes. These quantities use joules. Power is the rate of energy transfer, P = E/t, measured in watts.'
      ]},
      {heading:'Efficiency compares useful output with input',paragraphs:[
        'Efficiency = useful energy output / total energy input. Multiply by 100 for a percentage. Use the same units and the same operating interval. A real device has transfers to the surroundings, so a simple useful-output calculation usually gives less than 100%. When an answer exceeds 100%, check the system boundary, arithmetic and whether an additional energy source has been overlooked.'
      ]}
    ],
    diagram:diagram('energy','The illustrative transfers sum to the 100 J input; the useful fraction depends on the device’s purpose.'),
    example:{title:'A small motor',question:'A motor receives 100 J and transfers 60 J to useful motion, 30 J to thermal energy and 10 J to sound. Find efficiency.',steps:[
      'Check the account: 60 + 30 + 10 = 100 J.',
      'Useful fraction = 60/100 = 0.60. Multiply by 100%.'
    ],result:'The motor’s useful efficiency is 60%. All 100 J are still accounted for.'},
    check:{question:'What happens to kinetic energy if speed doubles while mass stays the same?',answer:'It becomes four times as large, because kinetic energy depends on speed squared: (2v)² = 4v².'}
  },
  {
    id:'acids-bases',subject:'Science',title:'Making sense of acids and bases',subtitle:'pH, neutralisation & particles',
    objective:'Relate the pH scale to concentration and explain neutralisation.',
    sections:[
      {heading:'Read the pH scale carefully',paragraphs:[
        'For common aqueous classroom solutions at 25°C, pH below 7 is acidic, pH 7 is neutral and pH above 7 is alkaline. The familiar 0–14 scale is useful but is not an absolute limit for all solutions. pH is logarithmic: a change of one unit corresponds to a tenfold change in hydrogen ion concentration in the introductory model.',
        'A solution at pH 3 has ten times the hydrogen ion concentration of one at pH 4. This comparison does not by itself tell you how much acid is present in a container. Volume, concentration and the acid’s dissociation behaviour are separate pieces of information.'
      ]},
      {heading:'Strong is not the same as concentrated',paragraphs:[
        'A strong acid dissociates essentially completely in water; a weak acid dissociates only partly. Concentration describes the amount of dissolved substance per unit volume. A dilute strong acid and a concentrated weak acid are both possible. Indicators change colour over particular pH ranges, so a colour is evidence for a range rather than an exact universal pH value.'
      ]},
      {heading:'Explain a reaction with particles',paragraphs:[
        'In a simple acid–hydroxide neutralisation, hydrogen ions react with hydroxide ions to form water: H⁺ + OH⁻ → H₂O. A salt remains from the other ions. Acid plus carbonate produces a salt, water and carbon dioxide. A neutralisation mixture is not automatically pH 7: amounts, reacting species and the final solution matter. Follow classroom laboratory safety instructions; never identify chemicals by tasting them.'
      ]}
    ],
    diagram:diagram('acids-bases','The labelled scale is a classroom model for aqueous solutions at 25°C; each pH step is multiplicative.'),
    example:{title:'Comparing two solutions',question:'How does hydrogen ion concentration at pH 2 compare with that at pH 4?',steps:[
      'The difference is two pH units.',
      'Each step toward lower pH multiplies hydrogen ion concentration by 10: 10 × 10 = 100.'
    ],result:'The pH 2 solution has 100 times the hydrogen ion concentration in this model; it is not merely “twice as acidic”.'},
    check:{question:'Why can “strong acid” and “concentrated acid” not be used interchangeably?',answer:'Strength concerns the extent of dissociation in water. Concentration concerns how much substance is present per unit volume. They describe different properties.'}
  },
  {
    id:'inheritance',subject:'Science',title:'From DNA to inherited variation',subtitle:'Genes, alleles & inheritance',
    objective:'Use a simple Mendelian model without treating it as a rule for every trait.',
    sections:[
      {heading:'Connect DNA, genes and chromosomes',paragraphs:[
        'DNA carries inherited information. A gene is a region of DNA with a functional role, and chromosomes are long DNA molecules packaged with proteins. Alleles are different versions at a gene locus. In a simple diploid model, an individual has two alleles at that locus, one inherited from each parent. Meiosis produces gametes with one allele from the pair.',
        'Genotype describes the allele combination, while phenotype describes an observable characteristic. Phenotype can depend on several genes and the environment. The one-gene examples used for practice are models of a particular pattern, not a complete account of human appearance or behaviour.'
      ]},
      {heading:'Read a Punnett square as a probability model',paragraphs:[
        'For a heterozygous parent Aa, the model gives gametes A and a with equal probability. Crossing Aa with Aa gives the equally likely combinations AA, Aa, Aa and aa. The genotype ratio is 1:2:1. If A is completely dominant, the phenotype ratio is 3:1. Dominant does not mean stronger, better or necessarily more common in a population.'
      ]},
      {heading:'Explain variation rather than predicting a family exactly',paragraphs:[
        'Each fertilisation is a new chance event in the model. A 1 in 4 probability does not guarantee one aa offspring in every group of four. Mutation can produce new alleles; recombination and independent assortment rearrange existing variation. Real inheritance can also involve incomplete dominance, multiple genes and other patterns, so state the assumptions of a simple cross before interpreting it.'
      ]}
    ],
    diagram:diagram('inheritance','A simplified Aa × Aa cross predicts probabilities, not an exact sequence of offspring.'),
    example:{title:'A fictional plant trait',question:'In a model, A gives smooth seeds and is completely dominant to a. Cross two Aa plants. What fraction is predicted to have rough seeds?',steps:[
      'Each parent contributes A or a. List AA, Aa, Aa and aa.',
      'Only aa expresses the recessive rough-seed phenotype under these assumptions.'
    ],result:'The predicted probability is 1/4, or 25%, for each offspring. The actual fraction in a small sample can differ.'},
    check:{question:'Does a dominant allele have to be the most common allele?',answer:'No. Dominance describes expression in a heterozygote in the model, not its frequency in the population.'}
  },
  {
    id:'ecosystems',subject:'Science',title:'Reading the relationships in a food web',subtitle:'Ecology & energy flow',
    objective:'Use feeding relationships to explain a possible ecosystem change.',
    sections:[
      {heading:'Organisms interact with a physical environment',paragraphs:[
        'An ecosystem includes organisms, their interactions and the non-living environment. A population is one species in an area; a community contains the interacting populations. Abiotic factors include light, temperature, water and soil conditions. Biotic factors include competition, predation and disease. An explanation should connect the relevant factor to survival or reproduction, rather than merely list it.',
        'Producers capture energy, commonly from sunlight through photosynthesis. Consumers obtain energy by feeding on other organisms. Decomposers break down organic material and help recycle matter. Energy flows through an ecosystem and is dissipated as heat; nutrients cycle between living and non-living components.'
      ]},
      {heading:'Use arrows consistently',paragraphs:[
        'In a food web, an arrow normally points from the organism being eaten to the consumer, showing the direction of energy transfer. A web shows several possible feeding links rather than one chain. It is still a simplified model: diets can change by season or life stage, and a diagram may omit important species. Always check its key and context.'
      ]},
      {heading:'Explain a change as a chain of effects',paragraphs:[
        'If a predator declines, its prey may increase, changing pressure on the prey’s food. This is a possible mechanism, not an automatic forecast. Other predators, resource limits, habitat and time delays can alter the outcome. Use evidence to support each step and distinguish a short-term response from a long-term equilibrium. Competition can occur within a species as well as between species.'
      ]}
    ],
    diagram:diagram('ecosystems','A simplified teaching web: arrows run from food to consumer, and do not imply every diet link is shown.'),
    example:{title:'A possible ripple effect',question:'In this model, what could happen if birds that eat wētā decline?',steps:[
      'Less bird predation could allow the wētā population to increase, if other factors permit.',
      'More herbivorous wētā could increase feeding pressure on plants; another limiting factor could reduce that effect.'
    ],result:'Explain the mechanism with qualified language and evidence. A real food web is more complex than the simplified drawing.'},
    check:{question:'Why is it incorrect to say energy is recycled in exactly the same way as nutrients?',answer:'Matter such as nutrients can cycle. Energy enters, passes through food webs and is dissipated as heat, so continual energy input is required.'}
  },
  {
    id:'historical-evidence',subject:'History',title:'How historians build a case',subtitle:'Sources, perspectives & evidence',
    objective:'Evaluate a source’s usefulness for a specific historical question.',
    sections:[
      {heading:'Start with a question and provenance',paragraphs:[
        'Historical inquiry uses surviving traces of the past to answer a question. Provenance means where a source comes from: its creator, date, place and circumstances of production. A primary source is produced in, or directly connected to, the period or experience being studied. A secondary source interprets earlier evidence. Neither label automatically makes a source accurate or useful.',
        'Usefulness depends on the question. A campaign poster may be poor evidence for how everyone voted but excellent evidence for the message its organisers wanted to spread. Separate what a source directly shows from what you infer.'
      ]},
      {heading:'Perspective is evidence, not simply a defect',paragraphs:[
        'People interpret events through their positions, experiences, values and access to information. Ask who the intended audience was and what purpose the source served. A partisan source may still reveal an important perspective. Do not call a source “biased” and stop; explain how a particular viewpoint shapes its content and what that means for the claim you are testing.'
      ]},
      {heading:'Corroborate and qualify a conclusion',paragraphs:[
        'Compare independent sources and check their context. Agreement can strengthen a claim, but two accounts may share the same original information. Differences may reflect perspective, timing or purpose rather than a simple mistake. Consider whose voices are missing and why some records survive more readily than others. A conclusion should be proportional to the evidence and acknowledge significant limits instead of claiming certainty from a single example.'
      ]}
    ],
    diagram:diagram('historical-evidence','Triangulate evidence while checking whether the sources are genuinely independent.'),
    example:{title:'A diary and a photograph',question:'A diary describes an enormous protest. A photograph shows a crowded street. Do they prove that nearly everyone supported it?',steps:[
      'They support the claim that a sizeable gathering occurred, subject to date, location and framing checks.',
      'They do not establish the views of people outside the frame or the proportion of the wider population attending.'
    ],result:'A defensible conclusion is narrower than “everyone supported it”. Seek additional evidence such as attendance estimates and a range of perspectives.'},
    check:{question:'Can a propaganda poster be useful historical evidence?',answer:'Yes. It can reveal intended messages, audience and values, even when its claims about events need checking against independent evidence.'}
  },
  {
    id:'te-tiriti',subject:'History',title:'Te Tiriti: texts in their context',subtitle:'Aotearoa New Zealand history',
    objective:'Explain why wording and historical perspectives matter when comparing the texts.',
    sections:[
      {heading:'Read two texts, not one simple translation',paragraphs:[
        'Te Tiriti o Waitangi and the English Treaty text were signed in 1840. Most rangatira signed the text in te reo Māori. The texts differ in important wording and concepts. Reading them historically requires attention to language, the political setting and the understandings of the people involved, rather than assuming the English text captures every signatory’s intention.'
      ]},
      {heading:'Compare the concepts with care',paragraphs:[
        'Article 1 of the Māori text uses kāwanatanga, commonly rendered as governance or governorship; the English text refers to sovereignty. Article 2 of the Māori text affirms tino rangatiratanga over lands, homes and taonga. The English text contains possession protections. These formulations should not be treated as identical. The meaning and effect of the texts have been central to historical debate and Waitangi Tribunal inquiry.'
      ]},
      {heading:'Build an evidence-based comparison',paragraphs:[
        'For revision, separate a textual observation from an interpretation of what a particular rangatira or Crown representative understood. Use a table: wording, relevant context, evidence of a perspective, and implications. Different iwi and hapū have distinct histories; do not describe Māori perspectives as a single unchanging view. Keep this introductory comparison separate from a claim to settle complex historical or legal questions.'
      ]}
    ],
    diagram:diagram('te-tiriti','An introductory comparison of selected wording. It is not a substitute for reading both full texts.'),
    example:{title:'A careful comparison sentence',question:'How can you discuss the Article 1 difference without assuming identical understandings?',steps:[
      'Identify the actual terms: kāwanatanga in the Māori text and sovereignty in the English text.',
      'Explain that the different concepts require historical context and evidence about particular participants’ understandings.'
    ],result:'A supported answer compares language and perspectives; it does not simply declare the texts word-for-word equivalents.'},
    check:{question:'Why should a comparison include evidence beyond the wording alone?',answer:'Context and evidence about particular participants help explain how words were understood. Textual differences alone do not establish every individual’s intention.'}
  },
  {
    id:'wwi-causes',subject:'History',title:'Causes are more than a trigger',subtitle:'The origins of the First World War',
    objective:'Distinguish long-term conditions, a trigger and decisions that escalated a conflict.',
    sections:[
      {heading:'Separate pressures from the immediate event',paragraphs:[
        'The First World War began in 1914 after a crisis that widened into a major European conflict. Long-term pressures included military competition, rival imperial ambitions, nationalism and alliance relationships. These factors created tensions but did not make a single outcome inevitable. An explanation needs to show how a factor affected decisions, not merely name it.',
        'The assassination of Archduke Franz Ferdinand at Sarajevo on 28 June 1914 was an immediate trigger. A trigger helps explain timing. It is not, by itself, a complete explanation for why several states went to war.'
      ]},
      {heading:'Trace the escalation through choices',paragraphs:[
        'During the July Crisis, diplomatic demands, commitments of support and military mobilisation interacted. Austria-Hungary declared war on Serbia on 28 July. Other decisions widened the conflict in the following days. Alliances mattered, but avoid describing them as a mechanical switch that removed all choice. Leaders interpreted threats, made calculations and acted under pressure; historians debate their relative responsibility.'
      ]},
      {heading:'Evaluate significance rather than list causes',paragraphs:[
        'A strong causal paragraph identifies a factor, explains a mechanism and supports it with precise evidence. Compare short-term and long-term roles. Ask whether a cause made war more likely, shaped its scale or explains its timing. Include connections: military plans could reduce the time available for diplomacy. Acknowledge an alternative explanation and justify your weighting rather than claiming that one acronym fully explains the war.'
      ]}
    ],
    diagram:diagram('wwi-causes','Pressures and a trigger interacted through decisions; the arrows do not imply inevitability.'),
    example:{title:'Turning a list into an explanation',question:'Improve “alliances caused the war”.',steps:[
      'Specify how commitments influenced the expectations and choices of particular governments.',
      'Connect those choices to a step in escalation, and distinguish support from an automatic obligation in every circumstance.'
    ],result:'The explanation now needs evidence of a mechanism and timing, rather than treating the existence of alliances as sufficient proof.'},
    check:{question:'What is the difference between a trigger and a long-term cause?',answer:'A trigger helps explain why a crisis began at a particular moment. A long-term cause helps explain the conditions that made escalation more likely or shaped its form.'}
  },
  {
    id:'rivers-flooding',subject:'Geography',title:'Why a river becomes a hazard',subtitle:'Catchments, flooding & risk',
    objective:'Connect physical processes and human decisions to flood risk.',
    sections:[
      {heading:'Follow water through a catchment',paragraphs:[
        'A catchment is the area draining to a river system. Precipitation may be intercepted by vegetation, infiltrate soil, remain in storage or move as surface runoff. Saturated soil and impermeable surfaces can increase rapid runoff. Slope, geology, vegetation and rainfall intensity all affect the river’s response; no single factor explains every flood.',
        'Discharge is the volume passing a point per unit time, commonly measured in cubic metres per second. A storm hydrograph shows discharge over time. Lag time is the delay between peak rainfall and peak discharge. A steep rising limb indicates a rapid response, but interpreting a graph requires its scales and the catchment context.'
      ]},
      {heading:'Distinguish hazard, exposure and vulnerability',paragraphs:[
        'A flood hazard is a potentially damaging physical event. Exposure concerns people, buildings and infrastructure in its path. Vulnerability concerns how susceptible they are to harm and their capacity to respond. A similar flood can have different consequences in two places. Consider access to warnings, evacuation routes, housing, resources and the location of essential services.'
      ]},
      {heading:'Compare responses and trade-offs',paragraphs:[
        'Stopbanks, detention areas, wetland restoration, planning rules and warnings address different parts of risk. A structure may protect one area but change flows elsewhere or create a false sense of security. Evaluate short- and long-term effects and whose perspectives are represented, including mana whenua and downstream communities. Use a named local case from your course when turning this conceptual framework into a specific assessment response.'
      ]}
    ],
    diagram:diagram('rivers-flooding','Flood risk emerges from the catchment process and the people and places exposed to it.'),
    example:{title:'Two neighbourhoods, one storm',question:'Why might a new paved development produce a faster river response than a vegetated area?',steps:[
      'Impermeable surfaces reduce infiltration and drainage systems can route runoff quickly toward the channel.',
      'A shorter transfer time can increase peak discharge, depending on storm conditions and the wider catchment.'
    ],result:'Explain both the process and the conditions. Do not assume every development necessarily produces the same change.'},
    check:{question:'If no people or assets are present, does a flood have the same risk as one through a town?',answer:'No. The physical hazard may be similar, but exposure and vulnerability differ, so the consequences and overall risk are different.'}
  },
  {
    id:'supply-demand',subject:'Economics',title:'How markets find a price',subtitle:'Supply, demand & equilibrium',
    objective:'Distinguish a movement along a curve from a shift of the curve.',
    sections:[
      {heading:'State the model and its assumptions',paragraphs:[
        'Demand describes the quantities buyers are willing and able to purchase at different prices, other things equal. Supply describes the quantities sellers are willing and able to offer. In the introductory competitive market model, demand slopes down and supply slopes up. A graph represents a relationship, not the path taken by one buyer on one day.',
        'Equilibrium is the price and quantity at which quantity demanded equals quantity supplied. It does not necessarily mean the outcome is fair or environmentally desirable. Keep the good, time period and units clear when interpreting a market diagram.'
      ]},
      {heading:'Move along or shift the whole curve',paragraphs:[
        'A change in the good’s own price causes movement along an existing curve. A change in another determinant can shift a curve. For example, lower input costs can increase supply, while a change in preferences can increase demand. “Demand increases” means more is demanded at each price, not simply that consumers buy more because the good’s price fell.'
      ]},
      {heading:'Explain the adjustment with both curves',paragraphs:[
        'At a price above equilibrium, quantity supplied exceeds quantity demanded in this model, creating excess supply and downward pressure on price. Below equilibrium there is excess demand. When one curve shifts, compare the old and new intersections and explain the pressure driving adjustment. If both curves shift, one outcome may be uncertain without information about their relative sizes. Use “other things equal” deliberately, not as decoration.'
      ]}
    ],
    diagram:diagram('supply-demand','Equilibrium E is an intersection of schedules; price is on the vertical axis and quantity on the horizontal.'),
    example:{title:'Lower production costs',question:'In the model, what happens when a new process lowers the cost of producing notebooks, with demand unchanged?',steps:[
      'Supply increases: sellers are willing to supply more notebooks at each price, so the supply curve shifts right.',
      'The new intersection with unchanged demand has a lower price and a higher quantity.'
    ],result:'Equilibrium price falls and equilibrium quantity rises, other things equal. This is a supply shift, not a movement caused by the notebook’s own price.'},
    check:{question:'If the price of a good falls, does that alone shift its demand curve?',answer:'No. A change in its own price causes a movement along the demand curve. A different determinant must change to shift demand.'}
  },
  {
    id:'algorithms',subject:'Digital Technologies',title:'Thinking like an algorithm',subtitle:'Sequence, selection & iteration',
    objective:'Trace an algorithm and use boundary tests to check its behaviour.',
    sections:[
      {heading:'An algorithm is a precise process',paragraphs:[
        'An algorithm describes a finite, unambiguous method for a task. Sequence determines the order of steps; selection chooses a branch based on a condition; iteration repeats steps. A program implements an algorithm in a language, but the underlying reasoning can also be expressed in pseudocode, a flowchart or plain structured instructions.',
        'Variables hold values that can change as the process runs. Assignment updates a variable; comparison asks a question about values. Trace these operations one at a time rather than guessing from the overall appearance of the code. State the input, intended output and assumptions before checking correctness.'
      ]},
      {heading:'Use a trace table',paragraphs:[
        'A trace table records the values of key variables after each step or iteration. For a running total, include the item just read and the new total. Check the initial value before the loop and whether the final item is processed. Off-by-one errors often come from confusing a list’s length with the index of its final element in a zero-indexed language.'
      ]},
      {heading:'Test ordinary, boundary and invalid inputs',paragraphs:[
        'An ordinary example may hide a faulty assumption. Test an empty list, a single item, zero and negative values if they are allowed. Define how invalid input is handled instead of silently treating every value as valid. A loop should make progress toward its termination condition. After a change, rerun earlier cases so a fix for one input does not break another. Correctness and efficiency are related but distinct questions.'
      ]}
    ],
    diagram:diagram('algorithms','The loop updates the total and consumes an item on every iteration, ensuring progress.'),
    example:{title:'Trace a running total',question:'Start total at 0. Add each score in [4, 0, 7]. What should a trace show?',steps:[
      'After reading 4, total is 4. After reading 0, total remains 4.',
      'After reading 7, total is 11, then the loop ends because there are no items left.'
    ],result:'The output is 11. For an empty list the output is 0, provided the initialisation occurs before the loop.'},
    check:{question:'Why should a maximum-finding algorithm not always initialise its maximum to zero?',answer:'If all allowed inputs are negative, zero would be an incorrect result that was not in the list. Use a suitable initial value or the first item, and define empty-list behaviour.'}
  },
  {
    id:'hauora',subject:'Health',title:'Wellbeing as a connected whole',subtitle:'Hauora & Te Whare Tapa Whā',
    objective:'Explain connections between dimensions of hauora using a specific situation.',
    sections:[
      {heading:'Understand the model’s origin',paragraphs:[
        'Te Whare Tapa Whā is a Māori model of health developed by Tā Mason Durie. The wharenui represents interconnected dimensions of wellbeing: taha tinana, physical; taha hinengaro, mental and emotional; taha whānau, family and social; and taha wairua, spiritual. Whenua provides a foundation of connection to land and roots. This is a holistic framework rather than four isolated scores.'
      ]},
      {heading:'Explain relationships in a real situation',paragraphs:[
        'Consider an original example: a student joins a lunchtime walking group. Movement can support physical wellbeing, but the situation also involves relationships, feelings and a sense of belonging. The effect depends on the student’s experience; an activity is not automatically beneficial for every person. Explain how a change in one dimension could influence another, and use the details of the scenario to justify the connection.'
      ]},
      {heading:'Look beyond an individual choice',paragraphs:[
        'A useful revision response considers the conditions that make a choice possible. Safe spaces, time, transport, cost, cultural inclusion and supportive relationships can affect participation. Compare actions at personal, interpersonal and community levels. For the walking-group example, an individual might invite a friend, peers might agree on an inclusive pace, and a school might provide a safe route. Evaluate who benefits, who may be excluded and how the response could be improved rather than assuming a single solution fits everyone.'
      ]}
    ],
    diagram:diagram('hauora','Original schematic of Durie’s model: connected dimensions supported by whenua; not an architectural drawing.'),
    example:{title:'Explain the connection',question:'A student feels isolated and starts attending a welcoming study group. How might two dimensions connect?',steps:[
      'Supportive peer relationships can strengthen taha whānau through a sense of social connection.',
      'Feeling supported may reduce anxiety and improve confidence, linking to taha hinengaro in this scenario.'
    ],result:'The answer names the dimensions and explains a plausible link using the situation, while recognising that the student’s own experience matters.'},
    check:{question:'Why is “exercise improves all four dimensions” too general as an explanation?',answer:'It does not show how the dimensions connect in a particular situation or consider barriers, cultural context and the person’s own experience.'}
  }
];

const topicIndex = new Map(studyTopics.map(topic=>[topic.id, topic]));
export const topicById = (id:string):StudyTopic|undefined=>topicIndex.get(id);
