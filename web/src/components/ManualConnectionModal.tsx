import { useState, useEffect } from 'react';
import { useMeshNetwork } from '../hooks/useMeshNetwork';

interface ManualConnectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialPeerId?: string;
}

export function ManualConnectionModal({ isOpen, onClose, initialPeerId }: ManualConnectionModalProps) {
    const { createManualOffer, acceptManualOffer, finalizeManualConnection, status } = useMeshNetwork();
    const [mode, setMode] = useState<'initiate' | 'join'>('initiate');
    const [step, setStep] = useState<'input' | 'offer' | 'answer' | 'success'>('input');
    const [peerId, setPeerId] = useState(initialPeerId || '');
    const [offerData, setOfferData] = useState('');
    const [answerData, setAnswerData] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialPeerId) {
            setPeerId(initialPeerId);
        }
    }, [initialPeerId]);

    const handleGenerateOffer = async () => {
        if (!peerId) {
            setError('Please enter a Peer ID');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const offer = await createManualOffer(peerId);
            setOfferData(offer);
            setStep('offer');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate offer');
        } finally {
            setLoading(false);
        }
    };

    const handleProcessOffer = async () => {
        if (!offerData) {
            setError('Please paste the Offer data');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const answer = await acceptManualOffer(offerData);
            setAnswerData(answer);
            setStep('answer');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to process offer');
        } finally {
            setLoading(false);
        }
    };

    const handleFinalize = async () => {
        if (!answerData) {
            setError('Please paste the Answer data');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await finalizeManualConnection(answerData);
            setStep('success');
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to finalize connection');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('Copied to clipboard!');
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content manual-connection-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>×</button>

                <h2>Manual Connection (WAN)</h2>

                <div className="local-peer-info">
                    <p><strong>Your Peer ID:</strong></p>
                    <div className="peer-id-display">
                        <code>{status.localPeerId}</code>
                        <button onClick={() => copyToClipboard(status.localPeerId)} title="Copy Peer ID">📋</button>
                    </div>
                    <p className="hint">Share this with your friend so they can initiate a connection.</p>
                </div>

                {step === 'input' && (
                    <div className="step-content">
                        <div className="mode-toggle">
                            <button
                                className={mode === 'initiate' ? 'active' : ''}
                                onClick={() => setMode('initiate')}
                            >
                                Initiate Connection
                            </button>
                            <button
                                className={mode === 'join' ? 'active' : ''}
                                onClick={() => setMode('join')}
                            >
                                Join Connection
                            </button>
                        </div>

                        {mode === 'initiate' ? (
                            <div className="form-group">
                                <label>Remote Peer ID:</label>
                                <input
                                    type="text"
                                    value={peerId}
                                    onChange={e => setPeerId(e.target.value)}
                                    placeholder="Enter Peer ID of the person you want to call"
                                />
                                <button onClick={handleGenerateOffer} disabled={loading}>
                                    {loading ? 'Generating...' : 'Generate Offer'}
                                </button>
                            </div>
                        ) : (
                            <div className="form-group">
                                <label>Paste Offer Data:</label>
                                <textarea
                                    value={offerData}
                                    onChange={e => setOfferData(e.target.value)}
                                    placeholder="Paste the offer string here..."
                                />
                                <button onClick={handleProcessOffer} disabled={loading}>
                                    {loading ? 'Processing...' : 'Generate Answer'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {step === 'offer' && (
                    <div className="step-content">
                        <h3>Step 1: Share Offer</h3>
                        <p>Send this data to your friend:</p>
                        <textarea readOnly value={offerData} />
                        <button onClick={() => copyToClipboard(offerData)}>Copy Offer</button>

                        <hr />

                        <h3>Step 2: Receive Answer</h3>
                        <p>Paste the answer they send back:</p>
                        <textarea
                            value={answerData}
                            onChange={e => setAnswerData(e.target.value)}
                            placeholder="Paste answer here..."
                        />
                        <button onClick={handleFinalize} disabled={loading}>
                            {loading ? 'Connecting...' : 'Finalize Connection'}
                        </button>
                    </div>
                )}

                {step === 'answer' && (
                    <div className="step-content">
                        <h3>Step 2: Share Answer</h3>
                        <p>Send this data back to the initiator:</p>
                        <textarea readOnly value={answerData} />
                        <button onClick={() => copyToClipboard(answerData)}>Copy Answer</button>
                        <p className="hint">Once they receive this, the connection will be established.</p>
                    </div>
                )}

                {step === 'success' && (
                    <div className="step-content success">
                        <h3>✅ Connected!</h3>
                        <p>You are now connected securely.</p>
                    </div>
                )}

                {error && <div className="error-message">{error}</div>}
            </div>
        </div>
    );
}
