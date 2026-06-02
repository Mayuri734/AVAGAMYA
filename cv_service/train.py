from sklearn.ensemble import RandomForestClassifier
import joblib
import numpy as np


def train_model():
    # Synthetic training data
    # Features: [text_blocks, images, fill, h_lines, v_lines, grid, wpb, font_var]
    data = [
        # TABLE pages: many lines, low words_per_block, high grid_score
        [5, 0, 0.7, 20, 8, 0.8, 3.2, 2.1],
        [8, 0, 0.8, 25, 10, 0.9, 2.8, 1.5],
        [3, 0, 0.6, 15, 6, 0.7, 4.0, 1.8],
        [4, 0, 0.5, 30, 12, 1.0, 2.5, 2.0],

        # TEXT pages: many blocks, no lines, high words_per_block
        [18, 0, 0.9, 0, 0, 0.0, 45.0, 1.2],
        [22, 0, 0.95, 1, 0, 0.0, 52.0, 0.9],
        [15, 0, 0.85, 0, 0, 0.0, 38.0, 1.5],
        [20, 0, 0.9, 0, 0, 0.0, 48.0, 1.0],

        # MIXED pages: moderate blocks, some lines, high font variance
        [10, 0, 0.8, 8, 4, 0.3, 20.0, 3.0],
        [12, 1, 0.75, 6, 3, 0.2, 18.0, 4.0],
        [9, 0, 0.7, 5, 2, 0.1, 22.0, 3.5],
        [11, 2, 0.6, 4, 2, 0.1, 15.0, 5.0],

        # HEADER pages: few blocks, low fill, high font variance
        [2, 1, 0.2, 0, 0, 0.0, 5.0, 8.0],
        [3, 2, 0.15, 0, 0, 0.0, 4.0, 10.0],
        [1, 0, 0.1, 0, 0, 0.0, 8.0, 12.0],
        [2, 1, 0.05, 0, 0, 0.0, 3.0, 15.0],
    ]
    labels = [
        'TABLE', 'TABLE', 'TABLE', 'TABLE',
        'TEXT', 'TEXT', 'TEXT', 'TEXT',
        'MIXED', 'MIXED', 'MIXED', 'MIXED',
        'HEADER', 'HEADER', 'HEADER', 'HEADER'
    ]

    X = np.array(data)
    y = np.array(labels)

    # Train a Random Forest
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X, y)

    # Save the model
    joblib.dump(clf, 'page_classifier.pkl')
    print("Model trained and saved as page_classifier.pkl")


if __name__ == "__main__":
    train_model()
