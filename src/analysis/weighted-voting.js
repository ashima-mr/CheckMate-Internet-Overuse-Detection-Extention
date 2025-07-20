'use strict';

import HoeffdingTree from './models/hoeffding-tree.js';
import { MSPC } from './models/mspc.js';

// Configuration
const INITIAL_MSPC_WEIGHT = 2.0;
const INITIAL_HAT_WEIGHT  = 1.0;
const ACC_HISTORY_LENGTH  = 200;  // Number of recent predictions to track
const FEEDBACK_BATCH_SIZE  = 50;  // How often to recompute weights

export default class WeightedVoter {
  constructor(opts = {}) {
    // Instantiate models (assumed already created/initialized elsewhere)
    if (!opts.tree || typeof opts.tree.predict !== 'function') {
        throw new Error('Invalid or missing HoeffdingTree instance.');
    }
        if (!opts.mspc || typeof opts.mspc.ingest !== 'function') {
        throw new Error('Invalid or missing MSPC instance.');
    }
    // assign models to instance variables
    this.tree = opts.tree;   // instance of HoeffdingTree
    this.mspc = opts.mspc;   // instance of MSPC

    // Voting weights
    this.wMspc = opts.initialMspcWeight ?? INITIAL_MSPC_WEIGHT;
    this.wHat  = opts.initialHatWeight  ?? INITIAL_HAT_WEIGHT;

    // Accuracy histories
    this.mspcHistory = [];
    this.hatHistory  = [];

    // Feedback aggregation
    this.feedbackCount = 0;
  }

  /**
   * Perform weighted voting on a new observation.
   * @param {Float64Array} mspcVector 6-dim vector for MSPC
   * @param {number[]} feat          Feature vector for HAT
   * @returns {object} { vote: 0|1|2, confidence: number }
   */
  vote(mspcVector, feat) {
    // 1. MSPC signal → binary: overuse (2) or not (0/1)
    const isSignal = this.mspc.ingest(mspcVector);
    const mspcVote = isSignal ? 2 : 1;  // non-productive if no signal
    // 2. HAT prediction
    const hatOut = this.tree.predict(feat);
    const hatVote = hatOut.prediction;         // 0,1,2
    const hatConf = typeof hatOut.confidence === 'number' ? hatOut.confidence : 1.0;        // [0..1]

    const hatVoteRemapped = (hatOriginal === 0 ? 1 : hatOriginal);

    // 3. Compute weighted scores per class
    const scores = { 1: 0, 2: 0 };
    // MSPC votes: treat its vote with full confidence = 1
    scores[mspcVote] += this.wMspc * 1.0;
    // HAT votes: use classifier’s own confidence
    scores[hatVoteRemapped] += this.wHat * hatConf;

    // 4. Determine combined vote
    const voteClass = scores[2] > scores[1] ? 2 : 1;
    const combinedConf = scores[voteClass] / (this.wMspc + this.wHat);

    // 5. Return vote
    return { vote: voteClass, confidence: combinedConf, mspcVote, hatOriginal, hatVoteRemapped };
  }

  /**
   * Process true label feedback. Call this when user provides true class.
   * This updates both model stats and voting weights periodically.
   * @param {Float64Array} mspcVector
   * @param {number[]} feat
   * @param {number} trueClass 0|1|2
   */
  handleFeedback(mspcVector, feat, trueClass) {
    // 1. Model updates
    // 1a. MSPC: treat signal as binary outcome
    const lastSignal = this.mspc.ingest(mspcVector);
    const mspcCorrect = (lastSignal ? 2 : 1) === trueClass;
    this._pushHistory(this.mspcHistory, mspcCorrect);

    // 1b. HAT: train with feedback
    this.tree.train(feat, trueClass, { classValue: trueClass, confidence: 1 });
    const hatPred = this.tree.predict(feat).prediction;
    const hatCorrect = hatPred === trueClass;
    this._pushHistory(this.hatHistory, hatCorrect);

    // 2. Update weights every batch
    this.feedbackCount++;
    if (this.feedbackCount >= FEEDBACK_BATCH_SIZE) {
      this._recomputeWeights();
      this.feedbackCount = 0;
    }
  }

  /** Push boolean accuracy into rolling history */
  _pushHistory(hist, correct) {
    hist.push(correct ? 1 : 0);
    if (hist.length > ACC_HISTORY_LENGTH) hist.shift();
  }

  /** Recompute wMspc and wHat based on recent accuracies */
  _recomputeWeights() {
    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
    const aM = avg(this.mspcHistory);
    const aH = avg(this.hatHistory);
    // Prevent division by zero
    const sum = aM + aH || 1;
    // Normalize to keep total weight constant
    const totalW = this.wMspc + this.wHat;
    this.wMspc = (aM / sum) * totalW;
    this.wHat  = (aH / sum) * totalW;
  }

  /**
   * If combined vote is “overuse” (2), dispatch notification.
   * Call this in your service-worker message handler.
   */
  notifyIfOveruse(result) {
    if (result.vote === 2) {
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_OVERUSE_NOTIFICATION',
            data: {
            timestamp: Date.now(),
            confidence: result.confidence,
            vote: result.vote,
            mspcscore: mspcVote, 
            hatscore: hatOriginal, 
            hatvote: hatVoteRemapped 
            }
        });
        } else {
        console.warn('Service worker not available for notification');
        }
    }
  }
}
